/** The fixed set of sandbox statuses: "draft", "review", "published", "claimed" and "merged". */
export type SandboxStatus = "draft" | "review" | "published" | "claimed" | "merged";

const STATUSES: ReadonlySet<string> = new Set<SandboxStatus>([
  "draft",
  "review",
  "published",
  "claimed",
  "merged",
]);

/** Known old spellings, already cleaned, and the status each means. */
const OLD_SPELLINGS: ReadonlyMap<string, SandboxStatus> = new Map<string, SandboxStatus>([
  ["in review", "review"],
  ["under review", "review"],
  ["reviewing", "review"],
  ["live", "published"],
  ["public", "published"],
  ["assigned", "claimed"],
  ["taken", "claimed"],
  ["done", "merged"],
  ["complete", "merged"],
  ["completed", "merged"],
]);

/** Trims the ends, lowercases, and makes every run of spaces, "-" and "_" one space. */
function clean(stored: string): string {
  return stored.trim().toLowerCase().replace(/[ \-_]+/g, " ");
}

/**
 * Reads a stored value as a status. The value is cleaned first (ends trimmed,
 * lowercased, every run of spaces, "-" and "_" made one space), and known old
 * spellings are read as their status. A value that is no status reads as
 * `null`, never as the nearest one.
 */
export function readStatus(stored: string): SandboxStatus | null {
  const cleaned = clean(stored);
  if (STATUSES.has(cleaned)) return cleaned as SandboxStatus;
  return OLD_SPELLINGS.get(cleaned) ?? null;
}

/**
 * Returns the value to store for a status; a status is written as itself.
 * Throws an error that names the value as given if it is anything other than
 * a status, including an old spelling.
 */
export function writeStatus(value: string): string {
  if (!STATUSES.has(value)) {
    throw new Error(`Not a sandbox status: "${value}"`);
  }
  return value;
}

/** A stored row: an id and its stored status value. */
export interface StoredStatusRow {
  id: string;
  status: string;
}

/** A row read back: its id and its status, or `null` for no status. */
export interface ReadStatusRow {
  id: string;
  status: SandboxStatus | null;
}

/** The result of reading many rows together. */
export interface ReadStatusesResult {
  /** Each row with its status, or no status. */
  rows: ReadStatusRow[];
  /** Each distinct original value that read as no status, once, sorted, exactly as it was stored. */
  unreadable: string[];
}

/** Reads many rows together and reports what could not be read. */
export function readStatuses(rows: StoredStatusRow[]): ReadStatusesResult {
  const unreadable = new Set<string>();
  const read = rows.map(({ id, status: stored }) => {
    const status = readStatus(stored);
    if (status === null) unreadable.add(stored);
    return { id, status };
  });
  return { rows: read, unreadable: [...unreadable].sort() };
}
