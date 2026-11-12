/**
 * Hidden tests for #45: `verifyCommand` returns
 * `gh api repos/lunox-work/sandbox-factory/attestations/<digest>`.
 *
 * Each test name starts with the key of the spec scenario it asserts. Each
 * extends a public test in `test/provenance-doc.test.ts`, named in the comment
 * above it.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  buildInfoSchema,
  unknownBuildInfo,
  verifyCommand,
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

/** A realistic, fixed sha256 digest computed from a fixed input. */
function sha256Digest(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

const OLD_FRAGMENTS = ["gh attestation verify", "--digest", "--repo", "oci://"];

// --- @happy ---------------------------------------------------------------

// Extends "[happy-1] a sha256 digest becomes a GitHub attestations API lookup":
// realistic digests, so a result hard-coded for the visible digests fails.
test("[happy-1] several distinct real sha256 digests each give the lookup for exactly that digest", () => {
  const digests = [
    sha256Digest("sandbox-factory api image 1"),
    sha256Digest("sandbox-factory api image 2"),
    sha256Digest(""),
    `sha256:${"f".repeat(64)}`,
    `sha256:${"0123456789abcdef".repeat(4)}`,
  ];
  const commands = digests.map((digest) =>
    verifyCommand({ ...identified, imageDigest: digest }),
  );
  assert.deepEqual(
    commands,
    digests.map((digest) => `${LOOKUP}${digest}`),
  );
  assert.equal(new Set(commands).size, digests.length);
});

// Extends "[happy-1] an all-zero sha256 digest ...": the exact full string,
// spelled out, so a different command shape that merely ends in the digest
// fails.
test("[happy-1] the lookup is the bare gh api path with the slug and no flags", () => {
  const digest = sha256Digest("exact-shape");
  const command = verifyCommand({ ...identified, imageDigest: digest });
  assert.equal(
    command,
    "gh api repos/lunox-work/sandbox-factory/attestations/" + digest,
  );
  assert.ok(command!.startsWith("gh api repos/"));
  assert.ok(!command!.includes("api.github.com"));
  assert.ok(!command!.includes("--jq"));
  assert.ok(!command!.includes("gh api /"));
});

// Extends "[happy-1] a sha256 digest becomes ...": calling twice on the same
// record gives the same result; the function is pure.
test("[happy-1] repeated calls on the same record give the same lookup", () => {
  const record: BuildInfoDto = {
    ...identified,
    imageDigest: sha256Digest("repeat"),
  };
  const first = verifyCommand(record);
  const second = verifyCommand(record);
  const third = verifyCommand({ ...record });
  assert.equal(first, `${LOOKUP}${record.imageDigest}`);
  assert.equal(second, first);
  assert.equal(third, first);
});

// Extends "[happy-2] the digest is inserted verbatim with the colon not
// URL-encoded": characters encodeURIComponent and encodeURI would both change
// are kept as is.
test("[happy-2] characters that URL-encoding would change are inserted verbatim", () => {
  for (const digest of [
    "sha256:ab/cd",
    "sha256:ab+cd",
    "sha256:ab?cd#ef",
    "sha256:ab@cd&ef=gh",
    "sha256:Ünïcødé",
  ]) {
    const command = verifyCommand({ ...identified, imageDigest: digest });
    assert.equal(command, `${LOOKUP}${digest}`);
    assert.ok(!command!.includes("%"), `encoded ${digest}`);
  }
});

// Extends "[happy-2] a digest with several colons ...": a realistic hex digest
// on the unknown fallback record, so the colon handling does not depend on
// the record being identified.
test("[happy-2] a real sha256 digest on the unknown fallback keeps its colon unencoded", () => {
  const digest = sha256Digest("unknown-fallback");
  const command = verifyCommand({ ...unknownBuildInfo, imageDigest: digest });
  assert.equal(command, `${LOOKUP}${digest}`);
  assert.ok(!command!.includes("%3A"));
  assert.ok(!command!.includes("%3a"));
});

// Extends "[happy-3] the command is a single line with no surrounding
// whitespace": a long digest and several real digests.
test("[happy-3] a very long digest still gives one trimmed line holding the whole digest", () => {
  const digest = `sha256:${"0123456789abcdef".repeat(256)}`;
  const command = verifyCommand({ ...identified, imageDigest: digest });
  assert.equal(command, `${LOOKUP}${digest}`);
  assert.ok(!command!.includes("\n"));
  assert.ok(!command!.includes("\r"));
  assert.equal(command, command!.trim());
});

// Extends "[happy-3] a one-character digest ...": a shortcut that pads or
// appends a trailing newline fails on any of these.
test("[happy-3] real sha256 digests on varied records give single trimmed lines", () => {
  const records: BuildInfoDto[] = [
    { ...identified, imageDigest: sha256Digest("x") },
    { ...unknownBuildInfo, imageDigest: sha256Digest("y") },
    { ...identified, dirty: true, imageDigest: sha256Digest("z") },
  ];
  for (const record of records) {
    const command = verifyCommand(record);
    assert.equal(command, `${LOOKUP}${record.imageDigest}`);
    assert.ok(!command!.includes("\n"));
    assert.equal(command, command!.trim());
  }
});

// --- @unhappy -------------------------------------------------------------

// Extends "[unhappy-1] the old, non-existent invocation is gone": many digests
// and records, checked for every fragment.
test("[unhappy-1] no old fragment appears for any digest or record shape", () => {
  const records: BuildInfoDto[] = [
    { ...identified, imageDigest: sha256Digest("one") },
    { ...identified, imageDigest: "sha512:abc" },
    { ...identified, dirty: true, imageDigest: sha256Digest("two") },
    {
      ...identified,
      version: "1.0.0",
      gitRef: "sandbox-factory-v1.0.0",
      imageDigest: sha256Digest("three"),
    },
    { ...unknownBuildInfo, imageDigest: DIGEST_A },
    { ...unknownBuildInfo, imageDigest: " " },
  ];
  for (const record of records) {
    const command = verifyCommand(record);
    assert.equal(command, `${LOOKUP}${record.imageDigest}`);
    for (const fragment of OLD_FRAGMENTS) {
      assert.ok(!command!.includes(fragment), `contains ${fragment}`);
    }
  }
});

// Extends "[unhappy-1] no old fragment appears for the unknown fallback ...":
// the old tool name in any form, not only the exact phrase.
test("[unhappy-1] the command names neither gh attestation nor a verify step", () => {
  const command = verifyCommand({
    ...identified,
    imageDigest: sha256Digest("no-verify"),
  });
  assert.equal(typeof command, "string");
  assert.ok(!command!.includes("attestation verify"));
  assert.ok(!command!.includes("gh attestation"));
  assert.ok(!command!.includes("verify"));
  assert.ok(!command!.includes("--"));
});

// Extends "[unhappy-2] a record with no imageDigest property gives undefined":
// the unknown fallback, a dirty record and a schema-parsed record, each
// without the property, against the same records with a digest.
test("[unhappy-2] records of every shape without an imageDigest property give undefined, and with one give the lookup", () => {
  const records: BuildInfoDto[] = [
    { ...unknownBuildInfo },
    { ...identified, dirty: true },
    { ...unknownBuildInfo, dirty: true, version: "1.0.0" },
    buildInfoSchema.parse(identified),
  ];
  for (const record of records) {
    assert.equal("imageDigest" in record, false);
    assert.equal(verifyCommand(record), undefined);
    assert.equal(
      verifyCommand({ ...record, imageDigest: DIGEST_A }),
      `${LOOKUP}${DIGEST_A}`,
    );
  }
});

// Extends "[unhappy-2] a released, dirty record ...": a property removed with
// `delete` is absent too.
test("[unhappy-2] a record whose imageDigest property was deleted gives undefined", () => {
  const record: BuildInfoDto = { ...identified, imageDigest: DIGEST_A };
  assert.equal(verifyCommand(record), `${LOOKUP}${DIGEST_A}`);
  delete record.imageDigest;
  assert.equal("imageDigest" in record, false);
  assert.equal(verifyCommand(record), undefined);
});

// Extends "[unhappy-3] imageDigest explicitly set to undefined gives
// undefined": dirty and released records, and never a command ending in the
// text "undefined".
test("[unhappy-3] explicitly undefined imageDigest on dirty and released records gives undefined", () => {
  const records: BuildInfoDto[] = [
    { ...identified, dirty: true, imageDigest: undefined },
    {
      ...identified,
      version: "1.0.0",
      gitRef: "sandbox-factory-v1.0.0",
      imageDigest: undefined,
    },
    { ...unknownBuildInfo, dirty: true, imageDigest: undefined },
  ];
  for (const record of records) {
    assert.equal("imageDigest" in record, true);
    assert.equal(verifyCommand(record), undefined);
  }
  assert.equal(
    verifyCommand({ ...records[0]!, imageDigest: DIGEST_A }),
    `${LOOKUP}${DIGEST_A}`,
  );
});

// Extends "[unhappy-3] the unknown fallback with imageDigest explicitly
// undefined ...": a digest overwritten with undefined is gone.
test("[unhappy-3] a digest later overwritten with undefined gives undefined", () => {
  const withDigest: BuildInfoDto = { ...identified, imageDigest: DIGEST_A };
  assert.equal(verifyCommand(withDigest), `${LOOKUP}${DIGEST_A}`);
  const overwritten: BuildInfoDto = { ...withDigest, imageDigest: undefined };
  assert.equal(verifyCommand(overwritten), undefined);
});

// --- @boundary ------------------------------------------------------------

// Extends "[boundary-1] an empty imageDigest is treated as absent": the
// unknown fallback and a dirty record, against a one-character digest that is
// not empty.
test("[boundary-1] an empty imageDigest is absent on every record shape, while a one-character one is not", () => {
  const bases: BuildInfoDto[] = [
    identified,
    unknownBuildInfo,
    { ...identified, dirty: true },
    { ...unknownBuildInfo, dirty: true },
  ];
  for (const base of bases) {
    assert.equal(verifyCommand({ ...base, imageDigest: "" }), undefined);
    assert.equal(verifyCommand({ ...base, imageDigest: "x" }), `${LOOKUP}x`);
  }
});

// Extends "[boundary-1] an empty imageDigest on a released record ...": never
// a command ending in a bare "attestations/".
test("[boundary-1] an empty imageDigest never yields a command ending in attestations/", () => {
  const result = verifyCommand({
    ...identified,
    dirty: true,
    version: "1.0.0",
    gitRef: "sandbox-factory-v1.0.0",
    imageDigest: "",
  });
  assert.equal(result, undefined);
  assert.notEqual(result, LOOKUP);
});

// Extends "[boundary-2] the unknown fallback record has no digest": the
// fallback itself and copies of it, against the fallback given a digest.
test("[boundary-2] the unknown fallback and its copies give undefined until a digest is added", () => {
  assert.equal("imageDigest" in unknownBuildInfo, false);
  assert.equal(verifyCommand(unknownBuildInfo), undefined);
  assert.equal(verifyCommand(structuredClone(unknownBuildInfo)), undefined);
  assert.equal(
    verifyCommand(buildInfoSchema.parse(unknownBuildInfo)),
    undefined,
  );
  const digest = sha256Digest("fallback-with-digest");
  assert.equal(
    verifyCommand({ ...unknownBuildInfo, imageDigest: digest }),
    `${LOOKUP}${digest}`,
  );
  assert.equal(verifyCommand(unknownBuildInfo), undefined);
});

// Extends "[boundary-3] non-sha256 and malformed digests pass through
// unchanged": more malformed shapes, including the ones a sha256 format check
// or a trim would reject or alter.
test("[boundary-3] digests in many malformed shapes are used verbatim", () => {
  const digests = [
    `sha256:${"A".repeat(64)}`,
    `SHA256:${"a".repeat(64)}`,
    `sha256:${"a".repeat(63)}`,
    `sha256:${"a".repeat(65)}`,
    "a".repeat(64),
    "sha256:",
    ":",
    "sha384:" + "b".repeat(96),
    "sha256:zz",
    "x",
  ];
  for (const digest of digests) {
    assert.equal(
      verifyCommand({ ...identified, imageDigest: digest }),
      `${LOOKUP}${digest}`,
      digest,
    );
  }
});

// Extends "[boundary-3] a single-space digest is not empty ...": other
// whitespace-only and whitespace-padded digests are not trimmed or treated as
// absent.
test("[boundary-3] whitespace in a digest is kept, not trimmed or treated as absent", () => {
  const digests = ["  ", "\t", ` ${DIGEST_A}`, `${DIGEST_A} `, "sha256:a b"];
  for (const digest of digests) {
    assert.equal(
      verifyCommand({ ...identified, imageDigest: digest }),
      `${LOOKUP}${digest}`,
      JSON.stringify(digest),
    );
  }
});

// Extends "[boundary-3] non-sha256 and malformed digests ...": on the unknown
// fallback too, a malformed digest is used verbatim.
test("[boundary-3] a malformed digest on the unknown fallback is used verbatim", () => {
  assert.equal(
    verifyCommand({ ...unknownBuildInfo, imageDigest: "sha512:abc" }),
    `${LOOKUP}sha512:abc`,
  );
  assert.equal(
    verifyCommand({ ...unknownBuildInfo, imageDigest: " " }),
    `${LOOKUP} `,
  );
});

// Extends "[boundary-4] the same digest gives the same command for identified
// and unknown records" and "... for dirty and released records": every
// combination of the overrides together, and other sha/time/ref values.
test("[boundary-4] the same digest gives the same command for every combination of the other fields", () => {
  const digest = DIGEST_A;
  const bases: BuildInfoDto[] = [identified, unknownBuildInfo];
  const dirties = [false, true];
  const releases = [
    {},
    { version: "1.0.0", gitRef: "sandbox-factory-v1.0.0" },
    { version: "2.3.4", gitRef: "feature/x" },
  ];
  for (const base of bases) {
    for (const dirty of dirties) {
      for (const release of releases) {
        const record: BuildInfoDto = {
          ...base,
          ...release,
          dirty,
          imageDigest: digest,
        };
        assert.equal(
          verifyCommand(record),
          `${LOOKUP}${digest}`,
          JSON.stringify(record),
        );
      }
    }
  }
});

// Extends "[boundary-4] ...": records that differ in sha, short sha and build
// time give the same command for one digest; a different digest gives a
// different command.
test("[boundary-4] records with different shas and build times share a command for one digest", () => {
  const digest = sha256Digest("shared");
  const other: BuildInfoDto = {
    version: "9.9.9",
    gitSha: "0000000000000000000000000000000000000001",
    gitShortSha: "0000000",
    buildTime: "2020-01-01T00:00:00.000Z",
    gitRef: "sandbox-factory-v9.9.9",
    dirty: true,
    imageDigest: digest,
  };
  const mixed: BuildInfoDto = {
    ...unknownBuildInfo,
    gitSha: identified.gitSha,
    imageDigest: digest,
  };
  assert.equal(verifyCommand(other), `${LOOKUP}${digest}`);
  assert.equal(verifyCommand(mixed), `${LOOKUP}${digest}`);
  assert.equal(
    verifyCommand({ ...identified, imageDigest: digest }),
    verifyCommand(other),
  );
  assert.notEqual(
    verifyCommand({ ...other, imageDigest: sha256Digest("different") }),
    verifyCommand(other),
  );
});

// Extends "[boundary-5] verifyCommand does not modify the record it is
// given": records with an empty, undefined or missing digest keep their exact
// shape, including whether the property exists.
test("[boundary-5] records with empty, undefined and missing digests are left exactly as given", () => {
  const empty: BuildInfoDto = { ...identified, imageDigest: "" };
  const explicit: BuildInfoDto = { ...identified, imageDigest: undefined };
  const missing: BuildInfoDto = { ...identified };
  const copies = [empty, explicit, missing].map((r) => structuredClone(r));

  assert.equal(verifyCommand(empty), undefined);
  assert.equal(verifyCommand(explicit), undefined);
  assert.equal(verifyCommand(missing), undefined);

  assert.deepEqual(empty, copies[0]);
  assert.equal(empty.imageDigest, "");
  assert.deepEqual(explicit, copies[1]);
  assert.equal("imageDigest" in explicit, true);
  assert.deepEqual(missing, copies[2]);
  assert.equal("imageDigest" in missing, false);
  assert.deepEqual(Object.keys(empty), Object.keys(copies[0]!));
});

// Extends "[boundary-5] verifyCommand works on a frozen record ...": frozen
// records with a malformed or whitespace digest, and frozen records with an
// empty digest, the unknown fallback included.
test("[boundary-5] frozen records with malformed, whitespace or empty digests are unchanged", () => {
  const withSpace = Object.freeze({ ...unknownBuildInfo, imageDigest: " " });
  const malformed = Object.freeze({
    ...identified,
    dirty: true,
    imageDigest: "sha512:abc",
  });
  const empty = Object.freeze({ ...identified, imageDigest: "" });
  const copies = [withSpace, malformed, empty].map((r) => structuredClone(r));

  assert.equal(verifyCommand(withSpace), `${LOOKUP} `);
  assert.equal(verifyCommand(malformed), `${LOOKUP}sha512:abc`);
  assert.equal(verifyCommand(empty), undefined);

  assert.deepEqual(withSpace, copies[0]);
  assert.deepEqual(malformed, copies[1]);
  assert.deepEqual(empty, copies[2]);
});

// Extends "[boundary-5] verifyCommand does not modify ...": the shared
// unknownBuildInfo export is not changed by calls on records built from it.
test("[boundary-5] calls on records spread from unknownBuildInfo leave the shared fallback unchanged", () => {
  const before = structuredClone(unknownBuildInfo);
  assert.equal(
    verifyCommand({ ...unknownBuildInfo, imageDigest: DIGEST_A }),
    `${LOOKUP}${DIGEST_A}`,
  );
  assert.equal(verifyCommand({ ...unknownBuildInfo, imageDigest: "" }), undefined);
  assert.equal(verifyCommand(unknownBuildInfo), undefined);
  assert.deepEqual(unknownBuildInfo, before);
  assert.equal("imageDigest" in unknownBuildInfo, false);
});
