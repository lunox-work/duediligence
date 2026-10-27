/** One entry of the name table: an environment variable name's real name and its public name. */
export interface NameEntry {
  real: string;
  public: string;
}

/** The name table of environment variable names. */
export type NameTable = readonly NameEntry[];

/** A file in the set being mapped: its path and its text. */
export interface SourceFile {
  path: string;
  text: string;
}

/** "to public" replaces real names with public ones, and "to real" the reverse. */
export type Direction = "to public" | "to real";

/** The outcome of mapping a set of files. */
export interface MapResult {
  /** The mapped files, one per input file, in the same order. */
  files: SourceFile[];
  /** Names found that are missing from the table, each once, sorted alphabetically. */
  unmapped: string[];
}

/**
 * Renames environment variable names through the name table, in `.env` files
 * and where code reads them from `process.env`.
 *
 * Throws an error naming the shared name if the table maps two names to one.
 */
export function mapFiles(
  files: readonly SourceFile[],
  table: NameTable,
  direction: Direction,
): MapResult {
  throw new Error("not implemented");
}
