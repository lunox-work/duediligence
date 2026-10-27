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

/**
 * Reverse-maps a unified diff through the name table, replacing public names
 * with real ones in file headers, rename lines and hunk content, so a
 * contributor's patch can be merged back. Everything else is kept unchanged
 * byte for byte.
 */
export function reverseMapDiff(diff: string, table: NameTable): ReverseMapResult {
  throw new Error("not implemented");
}
