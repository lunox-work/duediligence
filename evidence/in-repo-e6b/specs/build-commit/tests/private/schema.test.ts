import assert from "node:assert/strict";
import { test } from "node:test";

import * as buildInfo from "../../src/build-info.js";
import type { BuildInfoDto } from "../../src/build-info.js";
import * as index from "../../src/index.js";

// The spec has `src/index.ts` re-export everything from `build-info.ts`, and
// consumers import from `@sandbox-factory/shared`. The schema and constant
// scenarios below therefore read the exports through `src/index.ts` and check
// they are the very objects `build-info.ts` exports.
function exported<K extends keyof typeof buildInfo>(
  key: K,
): (typeof buildInfo)[K] {
  const value = (index as unknown as Record<string, unknown>)[key];
  assert.equal(
    value,
    buildInfo[key],
    `src/index.ts re-exports ${String(key)} from build-info.ts`,
  );
  return value as (typeof buildInfo)[K];
}

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const OTHER_SHA = "0123456789abcdef0123456789abcdef01234567";
const REPO = "https://github.com/lunox-work/sandbox-factory";

const known: BuildInfoDto = {
  version: "0.3.0",
  commit: SHA,
  builtAt: "2026-11-04T12:00:00.000Z",
  repository: REPO,
};

const allUnknown: BuildInfoDto = {
  version: "unknown",
  commit: "unknown",
  builtAt: "unknown",
  repository: "unknown",
};

const fields = ["version", "commit", "builtAt", "repository"] as const;
type Field = (typeof fields)[number];

function knownWith(changes: Record<string, unknown>): Record<string, unknown> {
  return { ...known, ...changes };
}

function omit(
  source: Record<string, unknown>,
  field: Field,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...source };
  delete copy[field];
  return copy;
}

// ---------------------------------------------------------------------------
// [happy-1] The unknown build info

// Extends public "[happy-1] UNKNOWN_BUILD is "unknown" and unknownBuildInfo uses it for every field":
// read through src/index.ts, and the object has exactly those four keys.
test("[happy-1] UNKNOWN_BUILD and unknownBuildInfo are re-exported from src/index.ts with every field unknown", () => {
  const UNKNOWN_BUILD = exported("UNKNOWN_BUILD");
  const unknownBuildInfo = exported("unknownBuildInfo");
  assert.equal(UNKNOWN_BUILD, "unknown");
  assert.deepEqual(unknownBuildInfo, allUnknown);
  assert.deepEqual(Object.keys(unknownBuildInfo).sort(), [
    "builtAt",
    "commit",
    "repository",
    "version",
  ]);
  for (const field of fields) {
    assert.equal(unknownBuildInfo[field], UNKNOWN_BUILD, field);
  }
});

// Extends public "[happy-1] buildInfoSchema parses unknownBuildInfo to an equal value":
// a separate, unfrozen all-unknown object parses to itself too.
test("[happy-1] buildInfoSchema from src/index.ts parses unknownBuildInfo and an all-unknown copy to themselves", () => {
  const schema = exported("buildInfoSchema");
  const unknownBuildInfo = exported("unknownBuildInfo");
  assert.deepEqual(schema.parse(unknownBuildInfo), unknownBuildInfo);
  assert.deepEqual(schema.parse({ ...allUnknown }), allUnknown);
});

// ---------------------------------------------------------------------------
// [unhappy-1] unknownBuildInfo cannot be modified

// Extends public "[unhappy-1] assigning to unknownBuildInfo.version throws a TypeError and changes nothing":
// the remaining fields, and assignments of other values.
test("[unhappy-1] assigning to builtAt or repository of unknownBuildInfo throws a TypeError and changes nothing", () => {
  const unknownBuildInfo = exported("unknownBuildInfo");
  assert.throws(() => {
    unknownBuildInfo.builtAt = "2026-11-04T12:00:00.000Z";
  }, TypeError);
  assert.throws(() => {
    unknownBuildInfo.repository = REPO;
  }, TypeError);
  assert.throws(() => {
    unknownBuildInfo.version = "unknown";
  }, TypeError);
  assert.deepEqual(unknownBuildInfo, allUnknown);
});

// Extends public "[unhappy-1] unknownBuildInfo is frozen, so assigning to commit also throws":
// a frozen object also rejects new keys and deletions.
test("[unhappy-1] unknownBuildInfo rejects added and deleted keys with a TypeError", () => {
  const unknownBuildInfo = exported("unknownBuildInfo");
  const target = unknownBuildInfo as unknown as Record<string, unknown>;
  assert.ok(Object.isFrozen(unknownBuildInfo));
  assert.throws(() => {
    target.branch = "main";
  }, TypeError);
  assert.throws(() => {
    delete target.version;
  }, TypeError);
  assert.equal("branch" in unknownBuildInfo, false);
  assert.deepEqual(unknownBuildInfo, allUnknown);
});

// ---------------------------------------------------------------------------
// [happy-2] A fully known build info parses to itself

// Extends public "[happy-2] buildInfoSchema parses another fully known build info to itself":
// more combinations of known values.
test("[happy-2] several fully known build infos parse to themselves", () => {
  const schema = exported("buildInfoSchema");
  const infos: BuildInfoDto[] = [
    known,
    {
      version: "1.0.0",
      commit: "0".repeat(40),
      builtAt: "2020-01-01T00:00:00.000Z",
      repository: "https://example.com",
    },
    {
      version: "2026.11.04",
      commit: "f".repeat(40),
      builtAt: "2026-12-31T23:59:59.999Z",
      repository: "https://example.com:8443/team/repo",
    },
    {
      version: "x",
      commit: OTHER_SHA,
      builtAt: "2026-11-04T12:00:00.000Z",
      repository: "https://gitlab.example.org/group/sub/project",
    },
  ];
  for (const info of infos) {
    assert.deepEqual(schema.parse(info), info, JSON.stringify(info));
  }
});

// ---------------------------------------------------------------------------
// [happy-3] Any single field may be "unknown"

// Extends public "[happy-3] an unknown commit leaves the other known fields as given":
// every field, not just commit, and the whole result is checked.
test("[happy-3] each single unknown field parses with the other known fields kept as given", () => {
  const schema = exported("buildInfoSchema");
  for (const field of fields) {
    const input = knownWith({ [field]: "unknown" });
    assert.deepEqual(schema.parse(input), input, field);
  }
});

// Extends public "[happy-3] each single field may be "unknown"":
// a different known build info as the base.
test("[happy-3] a single unknown field is accepted on another known build info", () => {
  const schema = exported("buildInfoSchema");
  const base: BuildInfoDto = {
    version: "0.4.0",
    commit: OTHER_SHA,
    builtAt: "2026-11-05T08:30:00.000Z",
    repository: "https://example.com/team/repo",
  };
  for (const field of fields) {
    const input = { ...base, [field]: "unknown" };
    const result = schema.safeParse(input);
    assert.equal(result.success, true, field);
    if (result.success) {
      assert.equal(result.data[field], "unknown", field);
      assert.deepEqual(result.data, input, field);
    }
  }
});

// ---------------------------------------------------------------------------
// [boundary-1] Unknown keys are dropped

// Extends public "[boundary-1] several extra keys are all dropped without an error":
// extra keys of other types, on an all-unknown build info.
test("[boundary-1] extra keys of any type are dropped from an all-unknown build info", () => {
  const schema = exported("buildInfoSchema");
  const result = schema.safeParse({
    ...allUnknown,
    branch: "main",
    dirty: 1,
    nested: { commit: "not a sha" },
    tags: ["v1"],
    nothing: null,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data, allUnknown);
    assert.deepEqual(Object.keys(result.data).sort(), [
      "builtAt",
      "commit",
      "repository",
      "version",
    ]);
  }
});

// Extends public "[boundary-1] an extra "branch" key is dropped from the parse result":
// an extra key whose value would be invalid for a known field does not cause an error.
test("[boundary-1] an extra key with an invalid-looking value is dropped and the input is not changed", () => {
  const schema = exported("buildInfoSchema");
  const input = { ...known, branch: "", sha: "A1B2C3D" };
  const result = schema.parse(input);
  assert.equal("branch" in result, false);
  assert.equal("sha" in result, false);
  assert.deepEqual(result, known);
  assert.deepEqual(input, { ...known, branch: "", sha: "A1B2C3D" });
});

// ---------------------------------------------------------------------------
// [boundary-2] Accepted edge values

// Extends public "[boundary-2] accepted edge values parse unchanged":
// other values in the known forms, none of them normalised.
test("[boundary-2] other edge values in the known forms parse unchanged", () => {
  const schema = exported("buildInfoSchema");
  const cases: Array<[Field, string]> = [
    ["version", "x"],
    ["version", "UNKNOWN"],
    ["version", "unknown "],
    ["version", "1.0 (beta)"],
    ["version", "V1.0.0"],
    ["commit", "0".repeat(40)],
    ["commit", "f".repeat(40)],
    ["commit", OTHER_SHA],
    ["builtAt", "2026-11-04T12:00:00.123456Z"],
    ["builtAt", "2026-11-04T23:59:59Z"],
    ["repository", "https://example.com"],
    ["repository", "https://example.com/"],
    ["repository", "https://example.com:8443/team/repo"],
    ["repository", "https://example.com/team/repo///"],
    ["repository", "https://example.com/team/repo.git.git"],
    ["repository", "https://example.com/team/repo.git/"],
  ];
  for (const [field, value] of cases) {
    const input = knownWith({ [field]: value });
    const result = schema.safeParse(input);
    assert.equal(result.success, true, `${field}=${value}`);
    if (result.success) {
      assert.equal(result.data[field], value, `${field}=${value}`);
      assert.deepEqual(result.data, input, `${field}=${value}`);
    }
  }
});

// Extends public "[boundary-2] a version with surrounding spaces is non-empty and kept as given":
// all the spec's edge values together, with the rest of the fields unknown.
test("[boundary-2] the spec's edge values parse unchanged alongside unknown fields", () => {
  const schema = exported("buildInfoSchema");
  const cases: Array<[Field, string]> = [
    ["version", "v1"],
    ["version", "0.3.0-rc.1+build.7"],
    ["builtAt", "2026-11-04T12:00:00Z"],
    ["repository", "https://github.com/lunox-work/sandbox-factory/"],
    ["repository", "https://example.com/team/repo.git"],
  ];
  for (const [field, value] of cases) {
    const input = { ...allUnknown, [field]: value };
    assert.deepEqual(schema.parse(input), input, `${field}=${value}`);
  }
});

// ---------------------------------------------------------------------------
// [unhappy-2] A missing required field is rejected

// Extends public "[unhappy-2] each missing required field is rejected":
// missing from an all-unknown build info.
test("[unhappy-2] a missing field is rejected even when every other field is unknown", () => {
  const schema = exported("buildInfoSchema");
  for (const field of fields) {
    assert.equal(
      schema.safeParse(omit({ ...allUnknown }, field)).success,
      false,
      field,
    );
  }
});

// Extends public "[unhappy-2] an empty object is rejected":
// a field present but undefined counts as missing, and two missing fields.
test("[unhappy-2] a field set to undefined, or two missing fields, is rejected", () => {
  const schema = exported("buildInfoSchema");
  for (const field of fields) {
    assert.equal(
      schema.safeParse(knownWith({ [field]: undefined })).success,
      false,
      field,
    );
  }
  assert.equal(
    schema.safeParse(omit(omit({ ...known }, "version"), "builtAt")).success,
    false,
  );
  assert.equal(
    schema.safeParse({ commit: SHA, repository: REPO }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// [unhappy-3] Invalid field values are rejected

// Extends public "[unhappy-3] invalid field values are rejected":
// other invalid values, including near-miss sentinels and whitespace.
test("[unhappy-3] other invalid field values are rejected", () => {
  const schema = exported("buildInfoSchema");
  const cases: Array<[Field, unknown]> = [
    ["version", null],
    ["version", 0.3],
    ["version", ["0.3.0"]],
    ["version", true],
    ["commit", `${SHA}\n`],
    [ "commit", ` ${SHA}`],
    ["commit", `${SHA.slice(0, 39)} `],
    ["commit", "unknown "],
    ["commit", "UNKNOWN"],
    ["commit", null],
    ["commit", 1234567],
    ["commit", "0123456789ABCDEF0123456789abcdef01234567"],
    ["builtAt", "2026-11-04T12:00:00.000+00:00"],
    ["builtAt", " 2026-11-04T12:00:00Z"],
    ["builtAt", "Unknown"],
    ["builtAt", 1793793600000],
    ["builtAt", new Date("2026-11-04T12:00:00.000Z")],
    ["builtAt", ""],
    ["repository", "ftp://example.com/repo"],
    ["repository", "ssh://git@github.com/lunox-work/sandbox-factory"],
    ["repository", "git@github.com:lunox-work/sandbox-factory.git"],
    ["repository", "UNKNOWN"],
    ["repository", null],
  ];
  for (const [field, value] of cases) {
    assert.equal(
      schema.safeParse(knownWith({ [field]: value })).success,
      false,
      `${field}=${String(value)}`,
    );
  }
});

// Extends public "[unhappy-3] a 64-character SHA-256 commit is rejected":
// the spec's invalid values are rejected when every other field is unknown too.
test("[unhappy-3] invalid values are rejected alongside unknown fields", () => {
  const schema = exported("buildInfoSchema");
  const cases: Array<[Field, unknown]> = [
    ["version", ""],
    ["version", 3],
    ["commit", "a1b2c3d"],
    ["commit", "a1b2c3d4e5f60718293a4b5c6d7e8f901234567"],
    ["commit", "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789"],
    ["commit", "A1B2C3D4E5F60718293A4B5C6D7E8F9012345678"],
    ["commit", "g1b2c3d4e5f60718293a4b5c6d7e8f9012345678"],
    ["commit", "Unknown"],
    ["commit", ""],
    ["commit", "a".repeat(64)],
    ["builtAt", "2026-11-04"],
    ["builtAt", "2026-11-04T12:00:00+01:00"],
    ["builtAt", "yesterday"],
    ["repository", "http://github.com/lunox-work/sandbox-factory"],
    ["repository", "git+https://github.com/lunox-work/sandbox-factory.git"],
    ["repository", "github.com/lunox-work/sandbox-factory"],
    ["repository", ""],
  ];
  for (const [field, value] of cases) {
    assert.equal(
      schema.safeParse({ ...allUnknown, [field]: value }).success,
      false,
      `${field}=${String(value)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// [happy-4] A version response parses

// Extends public "[happy-4] versionResponseSchema parses { build: known }":
// another known build, and unknown keys at the top level are dropped.
test("[happy-4] versionResponseSchema parses other known builds and drops extra top-level keys", () => {
  const schema = exported("versionResponseSchema");
  const other: BuildInfoDto = {
    version: "0.4.0",
    commit: OTHER_SHA,
    builtAt: "2026-11-05T08:30:00.000Z",
    repository: "https://example.com/team/repo",
  };
  assert.deepEqual(schema.parse({ build: other }), { build: other });
  const result = schema.parse({ build: known, status: "ok" });
  assert.deepEqual(result, { build: known });
  assert.equal("status" in result, false);
});

// Extends public "[happy-4] versionResponseSchema drops unknown keys inside build":
// a build with some fields unknown.
test("[happy-4] versionResponseSchema parses a build with version and builtAt unknown", () => {
  const schema = exported("versionResponseSchema");
  const build = knownWith({ version: "unknown", builtAt: "unknown" });
  assert.deepEqual(schema.parse({ build }), { build });
});

// ---------------------------------------------------------------------------
// [happy-5] A version response for an unknown build parses

// Extends public "[happy-5] versionResponseSchema parses { build: unknownBuildInfo }":
// an unfrozen all-unknown build with extra keys inside and outside.
test("[happy-5] versionResponseSchema parses an all-unknown build and drops extra keys", () => {
  const schema = exported("versionResponseSchema");
  const unknownBuildInfo = exported("unknownBuildInfo");
  assert.deepEqual(schema.parse({ build: unknownBuildInfo }), {
    build: unknownBuildInfo,
  });
  assert.deepEqual(
    schema.parse({ build: { ...allUnknown, branch: "main" }, ok: true }),
    { build: allUnknown },
  );
});

// ---------------------------------------------------------------------------
// [unhappy-4] Malformed version responses are rejected

// Extends public "[unhappy-4] malformed version responses are rejected":
// other malformed bodies.
test("[unhappy-4] other malformed version responses are rejected", () => {
  const schema = exported("versionResponseSchema");
  const bodies: unknown[] = [
    null,
    undefined,
    "known",
    [known],
    allUnknown,
    { build: "unknown" },
    { build: undefined },
    { build: {} },
    { build: [known] },
    { builds: known },
    { Build: known },
    { build: { ...known, commit: SHA.toUpperCase() } },
    { build: { ...known, builtAt: "2026-11-04T12:00:00+01:00" } },
    { build: { ...known, repository: "http://example.com/team/repo" } },
    { build: { ...known, version: "" } },
  ];
  for (const body of bodies) {
    assert.equal(schema.safeParse(body).success, false, String(JSON.stringify(body)));
  }
});

// Extends public "[unhappy-4] a version response whose build lacks a field is rejected":
// each missing field, from both a known and an all-unknown build.
test("[unhappy-4] a version response whose build lacks any one field is rejected", () => {
  const schema = exported("versionResponseSchema");
  for (const field of fields) {
    assert.equal(
      schema.safeParse({ build: omit({ ...known }, field) }).success,
      false,
      field,
    );
    assert.equal(
      schema.safeParse({ build: omit({ ...allUnknown }, field) }).success,
      false,
      field,
    );
  }
});
