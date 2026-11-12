/**
 * Build info: which commit each deployable (`api`, `web`, `extension`) was
 * built from, so a running build can be traced to the source and a client can
 * confirm it is talking to an API built from the same commit.
 *
 * Part of the wire contract: depends only on zod, has no I/O, and does not read
 * the clock, the environment or git. Callers collect the values and pass them in.
 */

import { z } from "zod";

/** The value held by a build info field whose value is not known. */
export const UNKNOWN_BUILD = "unknown";

/** The repository commit links point at. */
const REPOSITORY_URL = "https://github.com/lunox-work/sandbox-factory";

/** Separator between banner parts: space, U+00B7 MIDDLE DOT, space. */
const BANNER_SEPARATOR = " \u00b7 ";

/**
 * The build info a deployable reports: every field required, each string
 * field any non-empty string (including `UNKNOWN_BUILD`), `dirty` a boolean.
 * Unknown keys are dropped; values are not normalised.
 */
export const buildInfoSchema = z.object({
  version: z.string().min(1),
  gitSha: z.string().min(1),
  gitShortSha: z.string().min(1),
  buildTime: z.string().min(1),
  gitRef: z.string().min(1),
  dirty: z.boolean(),
});

/** Body of the version endpoint: the same schema object as `buildInfoSchema` (the build info itself, not wrapped). */
export const versionResponseSchema: typeof buildInfoSchema = buildInfoSchema;

export type BuildInfoDto = z.infer<typeof buildInfoSchema>;

/** Build info for a build nothing is known about: version `"0.0.0"`, dirty `false`, every other field `UNKNOWN_BUILD`. A plain, unfrozen object. */
export const unknownBuildInfo: BuildInfoDto = {
  version: "0.0.0",
  gitSha: UNKNOWN_BUILD,
  gitShortSha: UNKNOWN_BUILD,
  buildTime: UNKNOWN_BUILD,
  gitRef: UNKNOWN_BUILD,
  dirty: false,
};

/** `"<version>+<gitShortSha>"`, or just `"<version>"` when `gitShortSha` is unknown, followed by `"-dirty"` when dirty. Never throws. */
export function formatVersion(info: BuildInfoDto): string {
  const commit =
    info.gitShortSha === UNKNOWN_BUILD ? "" : `+${info.gitShortSha}`;
  const dirty = info.dirty ? "-dirty" : "";
  return `${info.version}${commit}${dirty}`;
}

/** True exactly when `gitSha` is not `"unknown"`. Never throws. */
export function isIdentified(info: BuildInfoDto): boolean {
  return info.gitSha !== UNKNOWN_BUILD;
}

/** `"https://github.com/lunox-work/sandbox-factory/commit/<gitSha>"`, or `undefined` when `gitSha` is unknown. Never throws. */
export function commitUrl(info: BuildInfoDto): string | undefined {
  return isIdentified(info)
    ? `${REPOSITORY_URL}/commit/${info.gitSha}`
    : undefined;
}

/** Compares `gitSha` when both builds are identified; true when either `gitSha` is unknown. Never throws. */
export function sameBuild(a: BuildInfoDto, b: BuildInfoDto): boolean {
  // An unknown commit is not reported as a mismatch.
  if (!isIdentified(a) || !isIdentified(b)) return true;
  return a.gitSha === b.gitSha;
}

/** `"<name> <formatVersion(info)>"`, followed by `" · commit <gitSha> · built <buildTime>"` when the build is identified. Never throws. */
export function buildBanner(name: string, info: BuildInfoDto): string {
  const head = `${name} ${formatVersion(info)}`;
  if (!isIdentified(info)) return head;
  return [head, `commit ${info.gitSha}`, `built ${info.buildTime}`].join(
    BANNER_SEPARATOR,
  );
}
