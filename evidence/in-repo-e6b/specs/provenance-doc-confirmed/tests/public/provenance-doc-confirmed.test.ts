/**
 * Tests for #45: `verifyCommand` prints the GitHub attestations lookup by
 * digest (`gh api /repos/lunox-work/sandbox-factory/attestations/<digest>`)
 * instead of the `gh attestation verify --digest` invocation, which does not
 * exist. Every other export keeps its current behaviour.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBanner,
  buildInfoSchema,
  commitUrl,
  formatVersion,
  isIdentified,
  releaseUrl,
  sameBuild,
  unknownBuildInfo,
  verifyCommand,
  type BuildInfoDto,
} from "../src/build-info.js";

const identified: BuildInfoDto = {
  version: "1.4.2",
  gitSha: "7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09",
  gitShortSha: "7f3a9c1",
  buildTime: "2026-09-17T09:14:00.000Z",
  gitRef: "main",
  dirty: false,
};

const PREFIX = "gh api /repos/lunox-work/sandbox-factory/attestations/";
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_HEX =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const withDigest = (digest: string): BuildInfoDto => ({
  ...identified,
  imageDigest: digest,
});

// --- @happy 1: A sha256 digest becomes a GitHub attestations API lookup ---

test("[happy-1] a sha256 digest becomes the gh api attestations lookup", () => {
  assert.equal(
    verifyCommand(withDigest(DIGEST_A)),
    "gh api /repos/lunox-work/sandbox-factory/attestations/sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
});

test("[happy-1] a different sha256 digest gives the lookup for that digest", () => {
  const digest = `sha256:${"f".repeat(64)}`;
  assert.equal(verifyCommand(withDigest(digest)), `${PREFIX}${digest}`);
});

// --- @happy 2: The digest is inserted verbatim, no URL-encoding of the colon ---

test("[happy-2] the digest is inserted verbatim with the colon unencoded", () => {
  const command = verifyCommand(withDigest(DIGEST_HEX));
  assert.equal(
    command,
    "gh api /repos/lunox-work/sandbox-factory/attestations/sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );
  assert.ok(command !== undefined && !command.includes("%3A"));
});

test("[happy-2] a digest with several colons keeps every colon unencoded", () => {
  const digest = "sha256:ab:cd:ef";
  const command = verifyCommand(withDigest(digest));
  assert.equal(command, `${PREFIX}sha256:ab:cd:ef`);
  assert.ok(command !== undefined && !command.includes("%3A"));
});

// --- @happy 3: The command is a single line with no surrounding whitespace ---

test("[happy-3] the command is a single line with no surrounding whitespace", () => {
  const command = verifyCommand(withDigest(DIGEST_A));
  assert.equal(typeof command, "string");
  assert.ok(command !== undefined && !command.includes("\n"));
  assert.equal(command, command?.trim());
});

test("[happy-3] the command for the unknown fallback with a digest is also one trimmed line", () => {
  const command = verifyCommand({ ...unknownBuildInfo, imageDigest: DIGEST_HEX });
  assert.equal(typeof command, "string");
  assert.ok(command !== undefined && !command.includes("\n"));
  assert.equal(command, command?.trim());
});

// --- @unhappy 1: The old, non-existent invocation is gone ---

for (const fragment of ["gh attestation verify", "--digest", "--repo", "oci://"]) {
  test(`[unhappy-1] the command does not contain "${fragment}"`, () => {
    const command = verifyCommand(withDigest(DIGEST_A));
    assert.equal(typeof command, "string");
    assert.ok(!command?.includes(fragment));
  });
}

test("[unhappy-1] no old fragment appears for a non-sha256 digest on a dirty build", () => {
  const command = verifyCommand({
    ...identified,
    dirty: true,
    imageDigest: "sha512:abc",
  });
  assert.equal(typeof command, "string");
  for (const fragment of ["gh attestation verify", "--digest", "--repo", "oci://"]) {
    assert.ok(!command?.includes(fragment), fragment);
  }
});

// --- @unhappy 2: No imageDigest property ---

test("[unhappy-2] a record with no imageDigest property gives undefined", () => {
  assert.equal("imageDigest" in identified, false);
  assert.equal(verifyCommand(identified), undefined);
});

test("[unhappy-2] a dirty released record with no imageDigest property gives undefined", () => {
  const record: BuildInfoDto = {
    ...identified,
    dirty: true,
    version: "1.0.0",
    gitRef: "sandbox-factory-v1.0.0",
  };
  assert.equal("imageDigest" in record, false);
  assert.equal(verifyCommand(record), undefined);
});

// --- @unhappy 3: imageDigest explicitly set to undefined ---

test("[unhappy-3] imageDigest explicitly set to undefined gives undefined", () => {
  const record: BuildInfoDto = { ...identified, imageDigest: undefined };
  assert.equal("imageDigest" in record, true);
  assert.equal(verifyCommand(record), undefined);
});

test("[unhappy-3] the unknown fallback with imageDigest explicitly undefined gives undefined", () => {
  assert.equal(
    verifyCommand({ ...unknownBuildInfo, imageDigest: undefined }),
    undefined,
  );
});

// --- @boundary 1: The unknown fallback record has no digest ---

test("[boundary-1] the unknown fallback record gives undefined", () => {
  assert.equal(verifyCommand(unknownBuildInfo), undefined);
});

test("[boundary-1] a dirty copy of the unknown fallback record gives undefined", () => {
  assert.equal(verifyCommand({ ...unknownBuildInfo, dirty: true }), undefined);
});

// --- @boundary 2: Non-sha256 or malformed digests pass through unchanged ---

for (const [imageDigest, command] of [
  ["sha512:abc", "gh api /repos/lunox-work/sandbox-factory/attestations/sha512:abc"],
  ["not-a-digest", "gh api /repos/lunox-work/sandbox-factory/attestations/not-a-digest"],
  [" ", "gh api /repos/lunox-work/sandbox-factory/attestations/ "],
] as const) {
  test(`[boundary-2] the digest ${JSON.stringify(imageDigest)} passes through unchanged`, () => {
    assert.equal(verifyCommand(withDigest(imageDigest)), command);
  });
}

test("[boundary-2] a digest with surrounding whitespace is not trimmed", () => {
  assert.equal(
    verifyCommand(withDigest(" sha256:abc ")),
    `${PREFIX} sha256:abc `,
  );
});

// --- @boundary 3: An empty imageDigest still gives a command ---

test("[boundary-3] an empty imageDigest gives the command ending in attestations/", () => {
  assert.equal(
    verifyCommand(withDigest("")),
    "gh api /repos/lunox-work/sandbox-factory/attestations/",
  );
});

test("[boundary-3] an empty imageDigest on the unknown fallback still gives a command", () => {
  assert.equal(
    verifyCommand({ ...unknownBuildInfo, imageDigest: "" }),
    "gh api /repos/lunox-work/sandbox-factory/attestations/",
  );
});

// --- @boundary 4: Only imageDigest decides the result ---

const EXPECTED_A =
  "gh api /repos/lunox-work/sandbox-factory/attestations/sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

for (const [label, record] of [
  ["identified, no other change", { ...identified, imageDigest: DIGEST_A }],
  ["unknownBuildInfo, no other change", { ...unknownBuildInfo, imageDigest: DIGEST_A }],
  ["identified, dirty true", { ...identified, imageDigest: DIGEST_A, dirty: true }],
  [
    'identified, version "1.0.0" and gitRef "sandbox-factory-v1.0.0"',
    {
      ...identified,
      imageDigest: DIGEST_A,
      version: "1.0.0",
      gitRef: "sandbox-factory-v1.0.0",
    },
  ],
] as const satisfies ReadonlyArray<readonly [string, BuildInfoDto]>) {
  test(`[boundary-4] the same digest gives the same command for ${label}`, () => {
    assert.equal(verifyCommand(record), EXPECTED_A);
  });
}

test("[boundary-4] the same digest gives the same command on a dirty unidentified record", () => {
  assert.equal(
    verifyCommand({
      ...unknownBuildInfo,
      dirty: true,
      gitRef: "sandbox-factory-v0.0.0",
      imageDigest: DIGEST_A,
    }),
    EXPECTED_A,
  );
});

// --- @boundary 5: verifyCommand does not modify the record it is given ---

test("[boundary-5] verifyCommand leaves a record with a digest unchanged", () => {
  const record = withDigest(DIGEST_A);
  const copy = structuredClone(record);
  verifyCommand(record);
  assert.deepEqual(record, copy);
});

test("[boundary-5] verifyCommand adds no imageDigest key to a record without one", () => {
  const record: BuildInfoDto = { ...identified };
  const copy = structuredClone(record);
  verifyCommand(record);
  assert.deepEqual(record, copy);
  assert.equal("imageDigest" in record, false);
});

// --- @happy 4: buildInfoSchema still accepts a digest and rejects an empty one ---

test("[happy-4] buildInfoSchema accepts a record with a digest and rejects an empty one", () => {
  const record = withDigest(DIGEST_A);
  assert.deepEqual(buildInfoSchema.parse(record), record);
  assert.equal(buildInfoSchema.safeParse(withDigest("")).success, false);
});

test("[happy-4] buildInfoSchema accepts the unknown fallback with a digest", () => {
  const record: BuildInfoDto = { ...unknownBuildInfo, imageDigest: DIGEST_A };
  assert.deepEqual(buildInfoSchema.parse(record), record);
});

// --- @happy 5: Adding a digest changes no other function's result ---

test("[happy-5] formatVersion is unchanged by a digest", () => {
  assert.equal(formatVersion(withDigest(DIGEST_A)), "1.4.2+7f3a9c1");
});

test("[happy-5] isIdentified is unchanged by a digest", () => {
  assert.equal(isIdentified(withDigest(DIGEST_A)), true);
});

test("[happy-5] commitUrl is unchanged by a digest", () => {
  assert.equal(
    commitUrl(withDigest(DIGEST_A)),
    "https://github.com/lunox-work/sandbox-factory/commit/7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09",
  );
});

test("[happy-5] releaseUrl is unchanged by a digest", () => {
  assert.equal(releaseUrl(withDigest(DIGEST_A)), undefined);
});

test("[happy-5] sameBuild is unchanged by a digest", () => {
  assert.equal(sameBuild(withDigest(DIGEST_A), identified), true);
});

test("[happy-5] buildBanner is unchanged by a digest", () => {
  assert.equal(
    buildBanner("api", withDigest(DIGEST_A)),
    "api 1.4.2+7f3a9c1 · commit 7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09 · built 2026-09-17T09:14:00.000Z",
  );
});

test("[happy-5] releaseUrl still resolves for a released build that has a digest", () => {
  assert.equal(
    releaseUrl({
      ...identified,
      version: "1.0.0",
      gitRef: "sandbox-factory-v1.0.0",
      imageDigest: DIGEST_A,
    }),
    "https://github.com/lunox-work/sandbox-factory/releases/tag/sandbox-factory-v1.0.0",
  );
});
