/**
 * The words analysis records use and the two pure rules they share: the
 * watchdog's retry rule and one canonical JSON encoding. This module imports
 * nothing.
 */

/** The closed list of statuses an analysis can be in. */
export const ANALYSIS_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

/** The closed list of codes a failed analysis records. */
export const ANALYSIS_ERROR_CODES = [
  "too_large",
  "too_many_files",
  "source_unavailable",
  "tool_failed",
  "tool_timeout",
  "upload_failed",
  "worker_lost",
  "cancelled",
] as const;
export type AnalysisErrorCode = (typeof ANALYSIS_ERROR_CODES)[number];

/** The closed list of kinds of artifact an analysis uploads. */
export const ARTIFACT_KINDS = [
  "graph_json",
  "graph_html",
  "report_md",
  "wiki_page",
  "manifest",
  "other",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** The tool version an analysis records. */
export const GRAPHIFY_TOOL_VERSION = "graphifyy@0.4.18+driver-1";

/** The parameters an analysis runs with: a deadline in minutes. */
export interface AnalysisParams {
  readonly deadlineMinutes: number;
}

/**
 * What the watchdog does with an analysis whose worker lost its lease.
 * `attempt` is the 1-based number of the attempt whose lease expired and
 * `maxAttempts` is how many attempts the analysis may have in all. While
 * `attempt < maxAttempts` it is requeued as `attempt + 1`; otherwise it is
 * failed as `attempt` (the caller records `worker_lost`).
 *
 * Throws a `RangeError` if `attempt`, then `maxAttempts`, is not a positive
 * safe integer.
 */
export function expiredAnalysis(
  attempt: number,
  maxAttempts: number,
): {
  status: "queued" | "failed";
  attempt: number;
} {
  if (!isPositiveSafeInteger(attempt)) {
    throw new RangeError("attempt must be a positive safe integer");
  }
  if (!isPositiveSafeInteger(maxAttempts)) {
    throw new RangeError("maxAttempts must be a positive safe integer");
  }
  return attempt < maxAttempts
    ? { status: "queued", attempt: attempt + 1 }
    : { status: "failed", attempt };
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * One fixed JSON encoding of plain data: compact, with object keys sorted
 * by UTF-16 code unit at every depth, so the same manifest always gives
 * the same bytes and the same hash.
 *
 * Throws a `TypeError` for anything that is not plain JSON data, including
 * a cyclic structure.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, new Set());
}

/** Encodes one value; `ancestors` holds the arrays and objects above it. */
function encode(value: unknown, ancestors: Set<object>): string {
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) refuse("a non-finite number");
      return JSON.stringify(value);
    case "undefined":
      return refuse("undefined");
    case "function":
      return refuse("a function");
    case "symbol":
      return refuse("a symbol");
    case "bigint":
      return refuse("a bigint");
  }
  if (value === null) return "null";

  const object = value as object;
  const isArray = Array.isArray(object);
  if (!isArray) {
    const prototype: unknown = Object.getPrototypeOf(object);
    if (prototype !== Object.prototype && prototype !== null) {
      refuse("a non-plain object");
    }
  }
  if (ancestors.has(object)) refuse("a cyclic structure");

  ancestors.add(object);
  let json: string;
  if (isArray) {
    const array = object as readonly unknown[];
    const parts: string[] = [];
    for (let i = 0; i < array.length; i += 1) {
      // A hole reads as undefined and is refused as one.
      parts.push(encode(Object.hasOwn(array, i) ? array[i] : undefined, ancestors));
    }
    json = `[${parts.join(",")}]`;
  } else {
    const record = object as Record<string, unknown>;
    const parts: string[] = [];
    // The default sort compares UTF-16 code units.
    for (const key of Object.keys(record).sort()) {
      const property = record[key];
      if (property === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${encode(property, ancestors)}`);
    }
    json = `{${parts.join(",")}}`;
  }
  ancestors.delete(object);
  return json;
}

function refuse(what: string): never {
  throw new TypeError(`canonicalJson cannot encode ${what}`);
}
