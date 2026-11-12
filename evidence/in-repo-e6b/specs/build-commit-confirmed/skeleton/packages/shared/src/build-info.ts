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
  throw new Error("not implemented");
}

/** True exactly when `gitSha` is not `"unknown"`. Never throws. */
export function isIdentified(info: BuildInfoDto): boolean {
  throw new Error("not implemented");
}

/** `"https://github.com/lunox-work/sandbox-factory/commit/<gitSha>"`, or `undefined` when `gitSha` is unknown. Never throws. */
export function commitUrl(info: BuildInfoDto): string | undefined {
  throw new Error("not implemented");
}

/** Compares `gitSha` when both builds are identified; true when either `gitSha` is unknown. Never throws. */
export function sameBuild(a: BuildInfoDto, b: BuildInfoDto): boolean {
  throw new Error("not implemented");
}

/** `"<name> <formatVersion(info)>"`, followed by `" · commit <gitSha> · built <buildTime>"` when the build is identified. Never throws. */
export function buildBanner(name: string, info: BuildInfoDto): string {
  throw new Error("not implemented");
}
