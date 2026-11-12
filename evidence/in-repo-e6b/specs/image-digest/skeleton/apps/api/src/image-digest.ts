/**
 * The digest of the container image the API is running, read from the
 * environment. CD writes it into the task definition as `IMAGE_DIGEST`, the
 * same way it writes `BUILD_SHA`.
 *
 * Like the `BUILD_*` provenance values in `env.ts`, a missing or unusable
 * digest leaves a gap in what the API reports. It is never a reason to fail
 * at boot.
 */

/**
 * Resolves the deployed image digest from `env.IMAGE_DIGEST`.
 *
 * Reads `env.IMAGE_DIGEST` once, synchronously, when called, and resolves to
 * that value with surrounding whitespace trimmed if it is exactly `sha256:`
 * followed by 64 lowercase hex characters; in every other case it resolves to
 * `undefined`. It never throws and the promise never rejects. It reads no
 * other key of `env`, never changes `env`, and keeps no cache.
 */
export async function resolveImageDigest(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  throw new Error("not implemented");
}
