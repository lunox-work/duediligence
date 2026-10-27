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
  _attempt: number,
  _maxAttempts: number,
): {
  status: "queued" | "failed";
  attempt: number;
} {
  throw new Error("not implemented");
}

/**
 * One fixed JSON encoding of plain data: compact, with object keys sorted
 * by UTF-16 code unit at every depth, so the same manifest always gives
 * the same bytes and the same hash.
 *
 * Throws a `TypeError` for anything that is not plain JSON data, including
 * a cyclic structure.
 */
export function canonicalJson(_value: unknown): string {
  throw new Error("not implemented");
}
