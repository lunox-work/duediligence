/**
 * Hidden tests for #45: the other exports keep their behaviour with a digest,
 * while `verifyCommand` on the same record gives the attestations lookup.
 *
 * Each test name starts with the key of the spec scenario it asserts. Each
 * extends a public test in `test/provenance-doc.test.ts`, named in the comment
 * above it.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  UNKNOWN_BUILD,
  buildBanner,
  buildInfoSchema,
  commitUrl,
  formatVersion,
  isIdentified,
  releaseTag,
  releaseUrl,
  sameBuild,
  unknownBuildInfo,
  verifyCommand,
  versionResponseSchema,
  type BuildInfoDto,
} from "../../src/build-info.js";

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

function sha256Digest(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

// --- @happy-4 -------------------------------------------------------------

// Extends "[happy-4] buildInfoSchema accepts a record with a digest and
// rejects an empty one": other digests, the unknown fallback, and
// versionResponseSchema; the parsed record yields the same lookup.
test("[happy-4] buildInfoSchema and versionResponseSchema accept records with varied digests unchanged", () => {
  const records: BuildInfoDto[] = [
    { ...identified, imageDigest: sha256Digest("schema") },
    { ...identified, imageDigest: "sha512:abc" },
    { ...identified, imageDigest: " " },
    { ...unknownBuildInfo, imageDigest: DIGEST_A },
    { ...identified, dirty: true, imageDigest: DIGEST_A },
  ];
  for (const record of records) {
    const parsed = buildInfoSchema.parse(record);
    assert.deepEqual(parsed, record);
    assert.deepEqual(versionResponseSchema.parse(record), record);
    assert.equal(verifyCommand(parsed), `${LOOKUP}${record.imageDigest}`);
  }
});

// Extends "[happy-4] ...rejects an empty one": the empty digest is rejected on
// every base record, and by versionResponseSchema, while verifyCommand on
// that same unparsed record treats it as absent.
test("[happy-4] buildInfoSchema rejects an empty digest on every record shape", () => {
  const bases: BuildInfoDto[] = [
    identified,
    unknownBuildInfo,
    { ...identified, dirty: true },
    { ...identified, version: "1.0.0", gitRef: "sandbox-factory-v1.0.0" },
  ];
  for (const base of bases) {
    const record = { ...base, imageDigest: "" };
    assert.equal(buildInfoSchema.safeParse(record).success, false);
    assert.equal(versionResponseSchema.safeParse(record).success, false);
    assert.equal(verifyCommand(record), undefined);
  }
});

// Extends "[happy-4] buildInfoSchema accepts a one-character digest": a very
// long digest is accepted unchanged and gives the lookup.
test("[happy-4] buildInfoSchema accepts a very long digest unchanged", () => {
  const record: BuildInfoDto = {
    ...identified,
    imageDigest: `sha256:${"ab".repeat(2048)}`,
  };
  const parsed = buildInfoSchema.parse(record);
  assert.deepEqual(parsed, record);
  assert.equal(verifyCommand(parsed), `${LOOKUP}${record.imageDigest}`);
});

// --- @happy-5 -------------------------------------------------------------

// Extends "[happy-5] adding a digest changes no other function's result": a
// different real digest, the same expected values, and the lookup alongside.
test("[happy-5] with a real sha256 digest the other functions give the spec's values", () => {
  const digest = sha256Digest("happy-5");
  const record: BuildInfoDto = { ...identified, imageDigest: digest };
  assert.equal(verifyCommand(record), `${LOOKUP}${digest}`);
  assert.equal(formatVersion(record), "1.4.2+7f3a9c1");
  assert.equal(isIdentified(record), true);
  assert.equal(
    commitUrl(record),
    "https://github.com/lunox-work/sandbox-factory/commit/7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09",
  );
  assert.equal(releaseUrl(record), undefined);
  assert.equal(sameBuild(record, identified), true);
  assert.equal(sameBuild(identified, record), true);
  assert.equal(
    buildBanner("api", record),
    "api 1.4.2+7f3a9c1 · commit 7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09 · built 2026-09-17T09:14:00.000Z",
  );
});

// Extends "[happy-5] the other functions agree with and without a digest ...":
// the unknown fallback with a digest stays unidentified everywhere else.
test("[happy-5] the unknown fallback with a digest is still unidentified to the other functions", () => {
  const record: BuildInfoDto = { ...unknownBuildInfo, imageDigest: DIGEST_A };
  assert.equal(verifyCommand(record), `${LOOKUP}${DIGEST_A}`);
  assert.equal(formatVersion(record), "0.0.0");
  assert.equal(isIdentified(record), false);
  assert.equal(commitUrl(record), undefined);
  assert.equal(releaseUrl(record), undefined);
  assert.equal(sameBuild(record, identified), true);
  assert.equal(sameBuild(identified, record), true);
  assert.equal(buildBanner("api", record), "api 0.0.0");
  assert.equal(record.gitSha, UNKNOWN_BUILD);
});

// Extends "[happy-5] adding a digest changes no other function's result":
// dirty and released records with a digest give the same values as without.
test("[happy-5] dirty and released records with a digest give the same other results as without", () => {
  const dirty: BuildInfoDto = { ...identified, dirty: true };
  const released: BuildInfoDto = {
    ...identified,
    version: "1.0.0",
    gitRef: releaseTag("1.0.0"),
  };
  const dirtyD: BuildInfoDto = { ...dirty, imageDigest: DIGEST_A };
  const releasedD: BuildInfoDto = { ...released, imageDigest: DIGEST_A };

  assert.equal(verifyCommand(dirtyD), `${LOOKUP}${DIGEST_A}`);
  assert.equal(verifyCommand(releasedD), `${LOOKUP}${DIGEST_A}`);

  assert.equal(formatVersion(dirtyD), "1.4.2+7f3a9c1-dirty");
  assert.equal(buildBanner("web", dirtyD), buildBanner("web", dirty));
  assert.equal(
    releaseUrl(releasedD),
    "https://github.com/lunox-work/sandbox-factory/releases/tag/sandbox-factory-v1.0.0",
  );
  assert.equal(releaseUrl(releasedD), releaseUrl(released));
  assert.equal(formatVersion(releasedD), "1.0.0+7f3a9c1");
  assert.equal(commitUrl(releasedD), commitUrl(released));
});

// Extends "[happy-5] ... in either sameBuild position": sameBuild still
// compares shas, not digests. Same digest on different commits is a mismatch;
// different digests on one commit are the same build.
test("[happy-5] sameBuild ignores the digest: same digest on different commits differs", () => {
  const otherCommit: BuildInfoDto = {
    ...identified,
    gitSha: "0000000000000000000000000000000000000001",
    gitShortSha: "0000000",
  };
  const a: BuildInfoDto = { ...identified, imageDigest: DIGEST_A };
  const b: BuildInfoDto = { ...otherCommit, imageDigest: DIGEST_A };
  const c: BuildInfoDto = {
    ...identified,
    imageDigest: sha256Digest("another image"),
  };
  assert.equal(verifyCommand(a), `${LOOKUP}${DIGEST_A}`);
  assert.equal(verifyCommand(b), verifyCommand(a));
  assert.equal(sameBuild(a, b), false);
  assert.equal(sameBuild(b, a), false);
  assert.notEqual(verifyCommand(a), verifyCommand(c));
  assert.equal(sameBuild(a, c), true);
  assert.equal(sameBuild(c, a), true);
});
