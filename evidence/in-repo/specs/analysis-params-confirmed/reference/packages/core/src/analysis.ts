/**
 * The words analysis records use and the two pure rules they share: the
 * watchdog's retry rule and the canonical JSON used as cache-key input.
 * This module stays dependency-free.
 */

/** The closed list of statuses an analysis can have. */
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

/** The parameters an analysis is run with. A type only: there is no validator. */
export interface AnalysisParams {
  readonly deadlineMinutes: number;
}

/**
 * Decides what the watchdog does with an analysis whose worker lost its
 * lease. `attempt` is the analysis's attempt number; `maxAttempts` is how many
 * attempts it may have in all. While `attempt < maxAttempts` it is requeued
 * as `attempt + 1`; otherwise it is failed with `attempt` unchanged (the
 * caller records `worker_lost`). Does not check its arguments and never
 * throws. Returns a new object on each call.
 */
export function expiredAnalysis(
  attempt: number,
  maxAttempts: number,
): { status: "queued" | "failed"; attempt: number } {
  if (attempt < maxAttempts) {
    return { status: "queued", attempt: attempt + 1 };
  }
  return { status: "failed", attempt };
}

/**
 * One fixed JSON encoding of data used as cache-key input: compact, arrays in
 * order, each object's own enumerable string keys sorted by UTF-16 code unit
 * at every depth, strings and numbers written as `JSON.stringify` writes them.
 * `toJSON` is never called. Does not modify its argument.
 *
 * Throws an `Error` with message "Cache parameters must be JSON values." for
 * `undefined`, functions and symbols wherever they appear; throws a
 * `TypeError` for a bigint; throws a `RangeError` for a cyclic structure.
 */
export function canonicalJson(value: unknown): string {
  return writeCanonical(value, []);
}

const NOT_JSON = "Cache parameters must be JSON values.";

/** Orders strings by UTF-16 code unit, as the default `Array.prototype.sort` does. */
function byCodeUnit(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

/** `ancestors` holds the objects currently being written, to detect cycles. */
function writeCanonical(value: unknown, ancestors: object[]): string {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return JSON.stringify(value);
    case "bigint":
      throw new TypeError("Cache parameters cannot hold a bigint.");
    case "undefined":
    case "function":
    case "symbol":
      throw new Error(NOT_JSON);
  }
  if (value === null) {
    return "null";
  }
  const object = value as object;
  if (ancestors.includes(object)) {
    throw new RangeError("Cache parameters cannot be cyclic.");
  }
  ancestors.push(object);
  let written: string;
  if (Array.isArray(object)) {
    const items: string[] = [];
    for (let index = 0; index < object.length; index += 1) {
      items.push(index in object ? writeCanonical(object[index], ancestors) : "");
    }
    written = `[${items.join(",")}]`;
  } else {
    const record = object as Record<string, unknown>;
    const members = Object.keys(record)
      .sort(byCodeUnit)
      .map((key) => `${JSON.stringify(key)}:${writeCanonical(record[key], ancestors)}`);
    written = `{${members.join(",")}}`;
  }
  ancestors.pop();
  return written;
}
