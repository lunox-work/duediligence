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

/** An assignment line in a .env file: indentation, optional `export`, the name, then `=`. */
const ENV_ASSIGNMENT = /^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)(?=[ \t]*=)/;

/**
 * A read of process.env in code, by dot (`process.env.NAME`) or by bracket
 * with a string literal (`process.env["NAME"]`, `process.env['NAME']`).
 */
const ENV_READ =
  /(?<![\w$.])(process\.env)(?:(\.)([A-Za-z_$][\w$]*)|(\[[ \t]*(["']))([^"'\\\r\n]+)(\5[ \t]*\]))/g;

/** Whether a path names a .env file: its file name is ".env" or starts with ".env.". */
function isEnvFile(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name === ".env" || name.startsWith(".env.");
}

/** Builds the lookup from source names to target names, refusing a table that maps two names to one. */
function buildLookup(table: NameTable, direction: Direction): Map<string, string> {
  const realOf = new Map<string, string>();
  for (const entry of table) {
    const earlier = realOf.get(entry.public);
    if (earlier !== undefined && earlier !== entry.real) {
      throw new Error(
        `The name table maps both "${earlier}" and "${entry.real}" to the public name "${entry.public}"`,
      );
    }
    realOf.set(entry.public, entry.real);
  }
  const lookup = new Map<string, string>();
  for (const entry of table) {
    const [from, to] = direction === "to public" ? [entry.real, entry.public] : [entry.public, entry.real];
    if (!lookup.has(from)) lookup.set(from, to);
  }
  return lookup;
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
  const lookup = buildLookup(table, direction);
  const known = new Set<string>();
  for (const entry of table) {
    known.add(entry.real);
    known.add(entry.public);
  }
  const unmapped = new Set<string>();

  // Each name is looked up once, so names are replaced at once rather than entry after entry.
  const rename = (name: string): string => {
    const mapped = lookup.get(name);
    if (mapped !== undefined) return mapped;
    if (!known.has(name)) unmapped.add(name);
    return name;
  };

  const mapped = files.map((file) => ({
    path: file.path,
    text: isEnvFile(file.path) ? mapEnvText(file.text, rename) : mapCodeText(file.text, rename),
  }));

  return { files: mapped, unmapped: [...unmapped].sort() };
}

/** Renames only the name before "=" on each assignment line, keeping comments, values and line endings. */
function mapEnvText(text: string, rename: (name: string) => string): string {
  return text
    .split("\n")
    .map((line) => line.replace(ENV_ASSIGNMENT, (_, lead: string, name: string) => lead + rename(name)))
    .join("\n");
}

/** Renames only the names read from process.env, leaving comments and other strings as they are. */
function mapCodeText(text: string, rename: (name: string) => string): string {
  return text.replace(
    ENV_READ,
    (
      _,
      env: string,
      dot: string | undefined,
      dotName: string | undefined,
      open: string | undefined,
      _quote: string | undefined,
      bracketName: string | undefined,
      close: string | undefined,
    ) =>
      dot !== undefined
        ? env + dot + rename(dotName!)
        : env + open! + rename(bracketName!) + close!,
  );
}
