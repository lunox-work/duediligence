/** Why an added package fails the scan: a GPL or AGPL licence, or a licence that cannot be told. */
export type OffenceReason = "copyleft" | "unknown";

/** A failing package: its name, version, licence as written (null when the entry has none), and reason. */
export interface Offender {
  name: string;
  version: string;
  licence: string | null;
  reason: OffenceReason;
}

/**
 * The result of a scan: it passes when nothing fails, and otherwise lists
 * each failing package once per name and version pair, ordered by name, then version.
 */
export interface ScanResult {
  passed: boolean;
  offenders: Offender[];
}

/**
 * Compares the submission's "package-lock.json" text with the version's own
 * and scans the dependencies the submission adds for GPL, AGPL or unknown licences.
 *
 * Throws an error, rather than returning a result, when either text is not
 * JSON, has no "packages" object, or has a "lockfileVersion" other than 3.
 */
export function scanLicences(versionLockfile: string, submissionLockfile: string): ScanResult {
  throw new Error("not implemented");
}
