/**
 * Tests for #45: `verifyCommand` prints a provenance lookup that exists,
 * `gh api repos/lunox-work/sandbox-factory/attestations/<digest>`, instead of
 * the non-existent `gh attestation verify --digest …`.
 *
 * Each test name starts with the key of the spec scenario it asserts.
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

const LOOKUP = "gh api repos/lunox-work/sandbox-factory/attestations/";
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_HEX =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const OLD_FRAGMENTS = ["gh attestation verify", "--digest", "--repo", "oci://"];

// --- @happy ---------------------------------------------------------------

test("[happy-1] a sha256 digest becomes a GitHub attestations API lookup", () => {
  assert.equal(
    verifyCommand({ ...identified, imageDigest: DIGEST_A }),
    `${LOOKUP}${DIGEST_A}`,
  );
});

test("[happy-1] an all-zero sha256 digest gives the lookup for exactly that digest", () => {
  const digest = `sha256:${"0".repeat(64)}`;
  assert.equal(
    verifyCommand({ ...identified, imageDigest: digest }),
    `${LOOKUP}${digest}`,
  );
});

test("[happy-2] the digest is inserted verbatim with the colon not URL-encoded", () => {
  const command = verifyCommand({ ...identified, imageDigest: DIGEST_HEX });
  assert.equal(command, `${LOOKUP}${DIGEST_HEX}`);
  assert.ok(command !== undefined && !command.includes("%3A"));
});

test("[happy-2] a digest with several colons keeps every colon as is", () => {
  const digest = "sha256:ab:cd:ef";
  const command = verifyCommand({ ...identified, imageDigest: digest });
  assert.equal(command, `${LOOKUP}${digest}`);
  assert.ok(command !== undefined && !command.includes("%3A"));
});

test("[happy-3] the command is a single line with no surrounding whitespace", () => {
  const command = verifyCommand({ ...identified, imageDigest: DIGEST_A });
  assert.equal(typeof command, "string");
  assert.ok(!command!.includes("\n"));
  assert.equal(command, command!.trim());
});

test("[happy-3] a one-character digest still gives a single trimmed line", () => {
  const command = verifyCommand({ ...identified, imageDigest: "a" });
  assert.equal(typeof command, "string");
  assert.ok(!command!.includes("\n"));
  assert.equal(command, command!.trim());
});

test("[happy-4] buildInfoSchema accepts a record with a digest and rejects an empty one", () => {
  const record: BuildInfoDto = { ...identified, imageDigest: DIGEST_A };
  assert.deepEqual(buildInfoSchema.parse(record), record);
  assert.equal(
    buildInfoSchema.safeParse({ ...identified, imageDigest: "" }).success,
    false,
  );
});

test("[happy-4] buildInfoSchema accepts a one-character digest", () => {
  const record: BuildInfoDto = { ...identified, imageDigest: "a" };
  assert.deepEqual(buildInfoSchema.parse(record), record);
});

test("[happy-5] adding a digest changes no other function's result", () => {
  const record: BuildInfoDto = { ...identified, imageDigest: DIGEST_A };
  assert.equal(formatVersion(record), "1.4.2+7f3a9c1");
  assert.equal(isIdentified(record), true);
  assert.equal(
    commitUrl(record),
    "https://github.com/lunox-work/sandbox-factory/commit/7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09",
  );
  assert.equal(releaseUrl(record), undefined);
  assert.equal(sameBuild(record, identified), true);
  assert.equal(
    buildBanner("api", record),
    "api 1.4.2+7f3a9c1 · commit 7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09 · built 2026-09-17T09:14:00.000Z",
  );
});

test("[happy-5] the other functions agree with and without a digest, in either sameBuild position", () => {
  const record: BuildInfoDto = { ...identified, imageDigest: DIGEST_A };
  assert.equal(formatVersion(record), formatVersion(identified));
  assert.equal(isIdentified(record), isIdentified(identified));
  assert.equal(commitUrl(record), commitUrl(identified));
  assert.equal(releaseUrl(record), releaseUrl(identified));
  assert.equal(sameBuild(identified, record), true);
  assert.equal(buildBanner("api", record), buildBanner("api", identified));
});

// --- @unhappy -------------------------------------------------------------

test("[unhappy-1] the old, non-existent invocation is gone", () => {
  const command = verifyCommand({ ...identified, imageDigest: DIGEST_A });
  assert.equal(typeof command, "string");
  for (const fragment of OLD_FRAGMENTS) {
    assert.ok(!command!.includes(fragment), `contains ${fragment}`);
  }
});

test("[unhappy-1] no old fragment appears for the unknown fallback with a malformed digest", () => {
  const command = verifyCommand({
    ...unknownBuildInfo,
    imageDigest: "not-a-digest",
  });
  assert.equal(typeof command, "string");
  for (const fragment of OLD_FRAGMENTS) {
    assert.ok(!command!.includes(fragment), `contains ${fragment}`);
  }
});

test("[unhappy-2] a record with no imageDigest property gives undefined", () => {
  assert.equal("imageDigest" in identified, false);
  assert.equal(verifyCommand(identified), undefined);
});

test("[unhappy-2] a released, dirty record with no imageDigest property gives undefined", () => {
  const record: BuildInfoDto = {
    ...identified,
    version: "1.0.0",
    gitRef: "sandbox-factory-v1.0.0",
    dirty: true,
  };
  assert.equal(verifyCommand(record), undefined);
});

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

// --- @boundary ------------------------------------------------------------

test("[boundary-1] an empty imageDigest is treated as absent", () => {
  assert.equal(verifyCommand({ ...identified, imageDigest: "" }), undefined);
});

test("[boundary-1] an empty imageDigest on a released record is still treated as absent", () => {
  assert.equal(
    verifyCommand({
      ...identified,
      version: "1.0.0",
      gitRef: "sandbox-factory-v1.0.0",
      imageDigest: "",
    }),
    undefined,
  );
});

test("[boundary-2] the unknown fallback record has no digest", () => {
  assert.equal(verifyCommand(unknownBuildInfo), undefined);
});

test("[boundary-2] a dirty unknown fallback record has no digest either", () => {
  assert.equal(verifyCommand({ ...unknownBuildInfo, dirty: true }), undefined);
});

test("[boundary-3] non-sha256 and malformed digests pass through unchanged", () => {
  assert.equal(
    verifyCommand({ ...identified, imageDigest: "sha512:abc" }),
    "gh api repos/lunox-work/sandbox-factory/attestations/sha512:abc",
  );
  assert.equal(
    verifyCommand({ ...identified, imageDigest: "not-a-digest" }),
    "gh api repos/lunox-work/sandbox-factory/attestations/not-a-digest",
  );
});

test("[boundary-3] a single-space digest is not empty and is appended as one space", () => {
  assert.equal(
    verifyCommand({ ...identified, imageDigest: " " }),
    "gh api repos/lunox-work/sandbox-factory/attestations/ ",
  );
});

test("[boundary-4] the same digest gives the same command for identified and unknown records", () => {
  assert.equal(
    verifyCommand({ ...identified, imageDigest: DIGEST_A }),
    `${LOOKUP}${DIGEST_A}`,
  );
  assert.equal(
    verifyCommand({ ...unknownBuildInfo, imageDigest: DIGEST_A }),
    `${LOOKUP}${DIGEST_A}`,
  );
});

test("[boundary-4] the same digest gives the same command for dirty and released records", () => {
  assert.equal(
    verifyCommand({ ...identified, imageDigest: DIGEST_A, dirty: true }),
    `${LOOKUP}${DIGEST_A}`,
  );
  assert.equal(
    verifyCommand({
      ...identified,
      imageDigest: DIGEST_A,
      version: "1.0.0",
      gitRef: "sandbox-factory-v1.0.0",
    }),
    `${LOOKUP}${DIGEST_A}`,
  );
});

test("[boundary-5] verifyCommand does not modify the record it is given", () => {
  const record: BuildInfoDto = { ...identified, imageDigest: DIGEST_A };
  const copy = structuredClone(record);
  verifyCommand(record);
  assert.deepEqual(record, copy);
});

test("[boundary-5] verifyCommand works on a frozen record, which it cannot modify", () => {
  const record: BuildInfoDto = Object.freeze({
    ...identified,
    imageDigest: DIGEST_A,
  });
  const copy = structuredClone(record);
  assert.equal(verifyCommand(record), `${LOOKUP}${DIGEST_A}`);
  assert.deepEqual(record, copy);
});
