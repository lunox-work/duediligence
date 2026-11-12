/**
 * Image digest resolution. Asks the container runtime for the digest of the
 * image this process is running, instead of trusting a build argument, so
 * that `GET /version` can be checked against the image's provenance
 * attestation.
 */

/**
 * The digest of the deployed container image, from the `ImageID` field of the
 * ECS container metadata endpoint at `env.ECS_CONTAINER_METADATA_URI_V4`.
 *
 * Resolves to `undefined` when the digest is missing or unusable; it never
 * throws and the promise never rejects.
 */
export async function resolveImageDigest(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  throw new Error("not implemented");
}
