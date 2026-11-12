/**
 * Image digest resolution. Asks the container runtime for the digest of the
 * image this process is running, instead of trusting a build argument, so
 * that `GET /version` can be checked against the image's provenance
 * attestation.
 */

/**
 * How long the metadata endpoint gets to answer, body included. The agent is
 * on the same host, so a slow answer means something is wrong, and boot waits
 * on this.
 */
const METADATA_TIMEOUT_MS = 1000;

/**
 * The only digest form reported: `sha256:` and 64 lowercase hex characters.
 * Checked as-is — not trimmed or lowercased — since anything else is not what
 * the runtime reports for a pulled image and would not match an attestation.
 */
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

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
  // Read before any await, so the call sees env as it was when it was made.
  const uri = env.ECS_CONTAINER_METADATA_URI_V4;
  if (uri === undefined || uri === "") return undefined;

  // Like the BUILD_* values in env.ts, a missing digest is a reporting gap,
  // never a reason to fail at boot: every failure resolves to undefined.
  try {
    const response = await fetch(uri, {
      method: "GET",
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return undefined;
    const imageId: unknown = (body as Record<string, unknown>).ImageID;
    if (typeof imageId !== "string") return undefined;
    // A full reference (`repo@sha256:…`) carries the digest after the last `@`.
    const digest = imageId.slice(imageId.lastIndexOf("@") + 1);
    return DIGEST_PATTERN.test(digest) ? digest : undefined;
  } catch {
    return undefined;
  }
}
