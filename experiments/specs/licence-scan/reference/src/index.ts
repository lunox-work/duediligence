import { judgeExpression } from "./spdx.js";

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
  const versionPackages = readPackages(versionLockfile, "version");
  const submissionPackages = readPackages(submissionLockfile, "submission");

  const held = new Set<string>();
  for (const [path, entry] of Object.entries(versionPackages)) {
    if (path === "" || !isObject(entry)) continue;
    held.add(pairKey(packageName(path), versionOf(entry)));
  }

  const found = new Map<string, Offender>();
  for (const [path, entry] of Object.entries(submissionPackages)) {
    if (path === "" || !isObject(entry) || entry.dev === true) continue;
    const name = packageName(path);
    const version = versionOf(entry);
    const key = pairKey(name, version);
    if (held.has(key) || found.has(key)) continue;
    const licence = licenceOf(entry);
    const verdict = licence === null ? "unknown" : judgeExpression(licence);
    if (verdict !== "pass") found.set(key, { name, version, licence, reason: verdict });
  }

  const offenders = [...found.values()].sort(
    (a, b) => compare(a.name, b.name) || compare(a.version, b.version),
  );
  return { passed: offenders.length === 0, offenders };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a lockfile's "packages" object, refusing text that is not an npm lockfile version 3. */
function readPackages(text: string, label: string): Record<string, unknown> {
  let lockfile: unknown;
  try {
    lockfile = JSON.parse(text);
  } catch {
    throw new Error(`The ${label} lockfile is not JSON`);
  }
  if (!isObject(lockfile) || !isObject(lockfile.packages)) {
    throw new Error(`The ${label} lockfile has no "packages" object`);
  }
  if (lockfile.lockfileVersion !== 3) {
    throw new Error(`The ${label} lockfile is not lockfile version 3`);
  }
  return lockfile.packages;
}

/** A package's name is its path after the last "node_modules/". */
function packageName(path: string): string {
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  return index === -1 ? path : path.slice(index + marker.length);
}

function versionOf(entry: Record<string, unknown>): string {
  return typeof entry.version === "string" ? entry.version : "";
}

function pairKey(name: string, version: string): string {
  return JSON.stringify([name, version]);
}

/**
 * The licence as written: the "license" string, an old-style "license" object's "type",
 * or an old-style "licenses" array's types joined by OR. Null when there is none.
 */
function licenceOf(entry: Record<string, unknown>): string | null {
  const { license, licenses } = entry;
  if (typeof license === "string") return license;
  if (isObject(license)) return typeof license.type === "string" ? license.type : null;
  if (license === undefined && Array.isArray(licenses)) {
    const types = licenses.map((item) => (isObject(item) ? item.type : undefined));
    if (types.length === 0 || !types.every((type): type is string => typeof type === "string")) return null;
    return types.join(" OR ");
  }
  return null;
}

/** Orders by code unit, so the order does not depend on the locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
