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

/**
 * Scans a set of files, each with a path and text, for a list of terms
 * (the names the workspace goes by), finding a term however the code
 * happens to spell it. Short and generic terms are not scanned for.
 */
export function scan(terms: string[], files: ScanFile[]): ScanResult {
  throw new Error("not implemented");
}
