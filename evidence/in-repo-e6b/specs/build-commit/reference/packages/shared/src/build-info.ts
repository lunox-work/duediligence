/**
 * Build info: which commit each deployable (`api`, `web`, `extension`) was
 * built from, so a running build can be traced to the source and a client can
 * confirm it is talking to an API built from the same commit.
 *
 * Part of the wire contract: depends on zod only, no I/O, and does not read
 * the clock, the environment or git. Callers collect the values (for example
 * at build time) and pass them in.
 */

import { z } from "zod";

/** The value a field holds when it is not known. */
export const UNKNOWN_BUILD = "unknown";

/**
 * The commit a build came from. Every field is required and is either exactly
 * `UNKNOWN_BUILD` or a value in its known form; unknown keys are dropped.
 */
export const buildInfoSchema = z.object({
  version: z.union([z.literal(UNKNOWN_BUILD), z.string().min(1)]),
  commit: z.union([z.literal(UNKNOWN_BUILD), z.string().regex(/^[0-9a-f]{40}$/)]),
  builtAt: z.union([z.literal(UNKNOWN_BUILD), z.iso.datetime()]),
  repository: z.union([
    z.literal(UNKNOWN_BUILD),
    z.url({ protocol: /^https$/ }),
  ]),
});

export type BuildInfoDto = z.infer<typeof buildInfoSchema>;

/** Body of the version endpoint: `{ build: BuildInfoDto }`. */
export const versionResponseSchema = z.object({
  build: buildInfoSchema,
});

/** Every field is `UNKNOWN_BUILD`. The object is frozen. */
export const unknownBuildInfo: BuildInfoDto = Object.freeze({
  version: UNKNOWN_BUILD,
  commit: UNKNOWN_BUILD,
  builtAt: UNKNOWN_BUILD,
  repository: UNKNOWN_BUILD,
});

/**
 * `"<version> (<first 7 characters of commit>)"`, or `"unknown"` when both
 * version and commit are unknown.
 */
export function formatVersion(info: BuildInfoDto): string {
  if (info.version === UNKNOWN_BUILD && info.commit === UNKNOWN_BUILD) {
    return UNKNOWN_BUILD;
  }
  const commit =
    info.commit === UNKNOWN_BUILD ? UNKNOWN_BUILD : info.commit.slice(0, 7);
  return `${info.version} (${commit})`;
}

/** True exactly when `commit` is not `UNKNOWN_BUILD`. */
export function isIdentified(info: BuildInfoDto): boolean {
  return info.commit !== UNKNOWN_BUILD;
}

/**
 * `"<repository>/commit/<full commit>"` after removing trailing `/` and then
 * one trailing `.git` from repository; `undefined` when commit or repository
 * is unknown.
 */
export function commitUrl(info: BuildInfoDto): string | undefined {
  if (info.commit === UNKNOWN_BUILD || info.repository === UNKNOWN_BUILD) {
    return undefined;
  }
  const base = info.repository.replace(/\/+$/, "").replace(/\.git$/, "");
  return `${base}/commit/${info.commit}`;
}

/**
 * True exactly when both builds are identified and their commits are equal;
 * an unknown commit matches nothing.
 */
export function sameBuild(a: BuildInfoDto, b: BuildInfoDto): boolean {
  return isIdentified(a) && isIdentified(b) && a.commit === b.commit;
}

/**
 * `"<trimmed name> <formatVersion(info)>"`, followed by `" built <builtAt>"`
 * when builtAt is known.
 *
 * Throws `TypeError("A build banner needs a name.")` when `name` is empty
 * after trimming.
 */
export function buildBanner(name: string, info: BuildInfoDto): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new TypeError("A build banner needs a name.");
  }
  const banner = `${trimmed} ${formatVersion(info)}`;
  return info.builtAt === UNKNOWN_BUILD
    ? banner
    : `${banner} built ${info.builtAt}`;
}
