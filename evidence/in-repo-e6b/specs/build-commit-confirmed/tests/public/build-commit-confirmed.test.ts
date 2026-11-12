import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type BuildInfoDto,
  buildBanner,
  buildInfoSchema,
  commitUrl,
  formatVersion,
  isIdentified,
  sameBuild,
  UNKNOWN_BUILD,
  unknownBuildInfo,
  versionResponseSchema,
} from "../src/build-info.js";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const OTHER_SHA = "0123456789abcdef0123456789abcdef01234567";
const REPO = "https://github.com/lunox-work/sandbox-factory";

const known: BuildInfoDto = {
  version: "0.3.0",
  gitSha: SHA,
  gitShortSha: "a1b2c3d",
  buildTime: "2026-11-04T12:00:00.000Z",
  gitRef: "main",
  dirty: false,
};

const stringFields = [
  "version",
  "gitSha",
  "gitShortSha",
  "buildTime",
  "gitRef",
] as const;

const allFields = [...stringFields, "dirty"] as const;

function knownWith(changes: Partial<BuildInfoDto>): BuildInfoDto {
  return { ...known, ...changes };
}

function unknownWith(changes: Partial<BuildInfoDto>): BuildInfoDto {
  return { ...unknownBuildInfo, ...changes };
}

function knownWithout(field: (typeof allFields)[number]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...known };
  delete copy[field];
  return copy;
}

const expectedUnknown = {
  version: "0.0.0",
  gitSha: "unknown",
  gitShortSha: "unknown",
  buildTime: "unknown",
  gitRef: "unknown",
  dirty: false,
};

// ---------------------------------------------------------------- happy-1

test("[happy-1] UNKNOWN_BUILD is \"unknown\" and unknownBuildInfo uses it for every field except version and dirty", () => {
  assert.equal(UNKNOWN_BUILD, "unknown");
  assert.deepEqual(unknownBuildInfo, expectedUnknown);
  assert.deepEqual(buildInfoSchema.parse(unknownBuildInfo), unknownBuildInfo);
});

test("[happy-1] unknownBuildInfo is a plain object that is not frozen", () => {
  assert.equal(Object.isFrozen(unknownBuildInfo), false);
  assert.equal(Object.getPrototypeOf(unknownBuildInfo), Object.prototype);
  assert.deepEqual(Object.keys(unknownBuildInfo).sort(), [...allFields].sort());
});

// ---------------------------------------------------------------- happy-2

test("[happy-2] a fully known build info parses to itself", () => {
  assert.deepEqual(buildInfoSchema.parse(known), known);
});

test("[happy-2] parsed values are kept as given, not trimmed or lowercased", () => {
  const padded = knownWith({
    version: " 0.3.0 ",
    gitSha: SHA.toUpperCase(),
    gitRef: "  Main",
  });
  assert.deepEqual(buildInfoSchema.parse(padded), padded);
});

// ---------------------------------------------------------------- happy-3

test("[happy-3] any single string field may be \"unknown\"", () => {
  for (const field of stringFields) {
    const result = buildInfoSchema.safeParse(knownWith({ [field]: "unknown" }));
    assert.equal(result.success, true, field);
    if (result.success) {
      assert.equal(result.data[field], "unknown", field);
    }
  }
});

test("[happy-3] every string field may be \"unknown\" at once", () => {
  const allUnknown = knownWith({
    version: "unknown",
    gitSha: "unknown",
    gitShortSha: "unknown",
    buildTime: "unknown",
    gitRef: "unknown",
  });
  assert.deepEqual(buildInfoSchema.parse(allUnknown), allUnknown);
});

// ---------------------------------------------------------------- happy-4

test("[happy-4] a dirty build parses", () => {
  const result = buildInfoSchema.safeParse(knownWith({ dirty: true }));
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.dirty, true);
  }
});

test("[happy-4] a dirty build with an unknown commit parses", () => {
  const info = knownWith({ dirty: true, gitSha: "unknown" });
  assert.deepEqual(buildInfoSchema.parse(info), info);
});

// ---------------------------------------------------------------- happy-5

test("[happy-5] versionResponseSchema is the same object as buildInfoSchema", () => {
  assert.equal(versionResponseSchema, buildInfoSchema);
});

test("[happy-5] versionResponseSchema has the same shape object as buildInfoSchema", () => {
  assert.equal(versionResponseSchema.shape, buildInfoSchema.shape);
});

// ---------------------------------------------------------------- happy-6

test("[happy-6] a version response parses", () => {
  assert.deepEqual(versionResponseSchema.parse(known), known);
});

test("[happy-6] a version response for a dirty build parses", () => {
  const info = knownWith({ dirty: true });
  assert.deepEqual(versionResponseSchema.parse(info), info);
});

// ---------------------------------------------------------------- happy-7

test("[happy-7] a version response for an unknown build parses", () => {
  assert.deepEqual(versionResponseSchema.parse(unknownBuildInfo), unknownBuildInfo);
});

test("[happy-7] parsing unknownBuildInfo as a version response leaves it unchanged", () => {
  versionResponseSchema.parse(unknownBuildInfo);
  assert.deepEqual(unknownBuildInfo, expectedUnknown);
});

// ---------------------------------------------------------------- happy-8

test("[happy-8] formatting a version", () => {
  const examples: Array<[string, string, boolean, string]> = [
    ["0.3.0", "a1b2c3d", false, "0.3.0+a1b2c3d"],
    ["0.3.0", "a1b2c3d", true, "0.3.0+a1b2c3d-dirty"],
    ["0.3.0", "unknown", false, "0.3.0"],
    ["0.3.0", "unknown", true, "0.3.0-dirty"],
    ["unknown", "a1b2c3d", false, "unknown+a1b2c3d"],
  ];
  for (const [version, gitShortSha, dirty, text] of examples) {
    assert.equal(
      formatVersion(knownWith({ version, gitShortSha, dirty })),
      text,
      `${version} ${gitShortSha} ${dirty}`,
    );
  }
});

test("[happy-8] unknown version and short SHA on a dirty build format as \"unknown-dirty\"", () => {
  assert.equal(
    formatVersion(knownWith({ version: "unknown", gitShortSha: "unknown", dirty: true })),
    "unknown-dirty",
  );
});

// ---------------------------------------------------------------- happy-9

test("[happy-9] identifying a build", () => {
  assert.equal(isIdentified(known), true);
  assert.equal(
    isIdentified(
      knownWith({
        version: "unknown",
        gitShortSha: "unknown",
        buildTime: "unknown",
        gitRef: "unknown",
      }),
    ),
    true,
  );
  assert.equal(isIdentified(knownWith({ gitSha: "Unknown" })), true);
  assert.equal(isIdentified(knownWith({ gitSha: "unknown" })), false);
});

test("[happy-9] gitSha is compared case-sensitively with \"unknown\"", () => {
  assert.equal(isIdentified(knownWith({ gitSha: "UNKNOWN" })), true);
});

// ---------------------------------------------------------------- happy-10

test("[happy-10] URL for a known commit", () => {
  assert.equal(
    commitUrl(known),
    "https://github.com/lunox-work/sandbox-factory/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
  );
});

test("[happy-10] the commit URL uses gitSha verbatim", () => {
  const upper = SHA.toUpperCase();
  assert.equal(commitUrl(knownWith({ gitSha: upper })), `${REPO}/commit/${upper}`);
});

// ---------------------------------------------------------------- happy-11

test("[happy-11] same commit with different build details is the same build", () => {
  const b = knownWith({
    version: "0.4.0",
    buildTime: "2026-11-05T08:30:00.000Z",
    gitRef: "v0.4.0",
    dirty: true,
  });
  assert.equal(sameBuild(known, b), true);
});

test("[happy-11] same full commit with a different short SHA is the same build", () => {
  assert.equal(sameBuild(known, knownWith({ gitShortSha: "fffffff" })), true);
});

// ---------------------------------------------------------------- happy-12

test("[happy-12] different commits are not the same build", () => {
  assert.equal(sameBuild(known, knownWith({ gitSha: OTHER_SHA })), false);
});

test("[happy-12] different commits are not the same build in either order", () => {
  assert.equal(sameBuild(knownWith({ gitSha: OTHER_SHA }), known), false);
});

// ---------------------------------------------------------------- happy-13

test("[happy-13] banners", () => {
  assert.equal(
    buildBanner("api", known),
    "api 0.3.0+a1b2c3d · commit a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 · built 2026-11-04T12:00:00.000Z",
  );
  assert.equal(
    buildBanner("web", knownWith({ dirty: true })),
    "web 0.3.0+a1b2c3d-dirty · commit a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 · built 2026-11-04T12:00:00.000Z",
  );
  assert.equal(
    buildBanner("api", knownWith({ buildTime: "unknown" })),
    "api 0.3.0+a1b2c3d · commit a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 · built unknown",
  );
  assert.equal(buildBanner("api", knownWith({ gitSha: "unknown" })), "api 0.3.0+a1b2c3d");
});

test("[happy-13] a dirty build with an unknown commit has only name and version in its banner", () => {
  assert.equal(
    buildBanner("api", knownWith({ gitSha: "unknown", dirty: true })),
    "api 0.3.0+a1b2c3d-dirty",
  );
});

// ---------------------------------------------------------------- boundary-1

test("[boundary-1] unknown keys are dropped", () => {
  const result = buildInfoSchema.safeParse({ ...known, branch: "main" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(Object.hasOwn(result.data, "branch"), false);
    assert.deepEqual(result.data, known);
  }
});

test("[boundary-1] several unknown keys, including a differently cased field name, are dropped", () => {
  const result = buildInfoSchema.safeParse({
    ...known,
    branch: "main",
    GitSha: OTHER_SHA,
    repository: REPO,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data, known);
  }
});

// ---------------------------------------------------------------- boundary-2

test("[boundary-2] accepted edge values are kept unchanged", () => {
  const examples: Array<[(typeof stringFields)[number], string]> = [
    ["version", "v1"],
    ["version", "0.3.0-rc.1+build.7"],
    ["gitSha", "a1b2c3d"],
    ["gitSha", "A1B2C3D4E5F60718293A4B5C6D7E8F9012345678"],
    ["gitSha", "Unknown"],
    ["gitShortSha", "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"],
    ["buildTime", "2026-11-04T12:00:00+01:00"],
    ["buildTime", "yesterday"],
    ["gitRef", "v1.4.2"],
  ];
  for (const [field, value] of examples) {
    const result = buildInfoSchema.safeParse(knownWith({ [field]: value }));
    assert.equal(result.success, true, `${field} ${value}`);
    if (result.success) {
      assert.equal(result.data[field], value, `${field} ${value}`);
    }
  }
});

test("[boundary-2] a single-character string is accepted in every string field", () => {
  for (const field of stringFields) {
    const result = buildInfoSchema.safeParse(knownWith({ [field]: "x" }));
    assert.equal(result.success, true, field);
    if (result.success) {
      assert.equal(result.data[field], "x", field);
    }
  }
});

// ---------------------------------------------------------------- boundary-3

test("[boundary-3] gitSha, buildTime and gitRef do not affect the formatted version", () => {
  assert.equal(
    formatVersion(knownWith({ gitSha: "unknown", buildTime: "unknown", gitRef: "unknown" })),
    "0.3.0+a1b2c3d",
  );
});

test("[boundary-3] gitSha, buildTime and gitRef do not affect the formatted version of a dirty build", () => {
  assert.equal(
    formatVersion(
      knownWith({ gitSha: OTHER_SHA, buildTime: "yesterday", gitRef: "v9.9.9", dirty: true }),
    ),
    "0.3.0+a1b2c3d-dirty",
  );
});

// ---------------------------------------------------------------- boundary-4

test("[boundary-4] the unknown build info formats as \"0.0.0\"", () => {
  assert.equal(formatVersion(unknownBuildInfo), "0.0.0");
});

test("[boundary-4] the unknown build info marked dirty formats as \"0.0.0-dirty\"", () => {
  assert.equal(formatVersion(unknownWith({ dirty: true })), "0.0.0-dirty");
});

// ---------------------------------------------------------------- boundary-5

test("[boundary-5] the unknown build info is not identified", () => {
  assert.equal(isIdentified(unknownBuildInfo), false);
});

test("[boundary-5] the unknown build info with only gitSha known is identified", () => {
  assert.equal(isIdentified(unknownWith({ gitSha: SHA })), true);
});

// ---------------------------------------------------------------- boundary-6

test("[boundary-6] other fields do not matter to the commit URL", () => {
  const info = knownWith({
    version: "unknown",
    gitShortSha: "unknown",
    buildTime: "unknown",
    gitRef: "unknown",
    dirty: true,
  });
  assert.equal(
    commitUrl(info),
    "https://github.com/lunox-work/sandbox-factory/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
  );
});

test("[boundary-6] the commit URL reads gitSha, not gitShortSha", () => {
  assert.equal(commitUrl(knownWith({ gitShortSha: "fffffff" })), `${REPO}/commit/${SHA}`);
});

// ---------------------------------------------------------------- boundary-7

test("[boundary-7] same short SHA but different full SHA is not the same build", () => {
  assert.equal(
    sameBuild(known, knownWith({ gitSha: "a1b2c3dffffffffffffffffffffffffffffffff0" })),
    false,
  );
});

test("[boundary-7] full SHAs differing only in the last character are not the same build", () => {
  assert.equal(
    sameBuild(known, knownWith({ gitSha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345679" })),
    false,
  );
});

// ---------------------------------------------------------------- boundary-8

test("[boundary-8] an unknown commit is not reported as a mismatch", () => {
  assert.equal(sameBuild(known, unknownBuildInfo), true);
  assert.equal(sameBuild(unknownBuildInfo, known), true);
  assert.equal(sameBuild(unknownBuildInfo, unknownBuildInfo), true);
  assert.equal(
    sameBuild(knownWith({ gitSha: OTHER_SHA }), knownWith({ gitSha: "unknown" })),
    true,
  );
});

test("[boundary-8] two unknown commits with otherwise different details are not a mismatch", () => {
  assert.equal(
    sameBuild(
      knownWith({ gitSha: "unknown" }),
      unknownWith({ version: "9.9.9", dirty: true, gitShortSha: "fffffff" }),
    ),
    true,
  );
});

// ---------------------------------------------------------------- boundary-9

test("[boundary-9] a build is the same as itself", () => {
  assert.equal(sameBuild(known, known), true);
});

test("[boundary-9] a build is the same as a separate copy of itself", () => {
  assert.equal(sameBuild(known, { ...known }), true);
});

// ---------------------------------------------------------------- boundary-10

test("[boundary-10] sameBuild does not depend on argument order", () => {
  const b = knownWith({ gitSha: OTHER_SHA });
  assert.equal(sameBuild(known, b), sameBuild(b, known));
  assert.equal(sameBuild(known, unknownBuildInfo), sameBuild(unknownBuildInfo, known));
});

test("[boundary-10] sameBuild does not depend on argument order for the same commit with different details", () => {
  const b = knownWith({ version: "0.4.0", dirty: true, gitRef: "v0.4.0" });
  assert.equal(sameBuild(known, b), sameBuild(b, known));
});

// ---------------------------------------------------------------- boundary-11

test("[boundary-11] banner for the unknown build info", () => {
  assert.equal(buildBanner("extension", unknownBuildInfo), "extension 0.0.0");
});

test("[boundary-11] banner for the unknown build info marked dirty", () => {
  assert.equal(buildBanner("extension", unknownWith({ dirty: true })), "extension 0.0.0-dirty");
});

// ---------------------------------------------------------------- boundary-12

test("[boundary-12] gitRef \"unknown\" is not part of the banner", () => {
  assert.equal(
    buildBanner("api", knownWith({ gitRef: "unknown" })),
    "api 0.3.0+a1b2c3d · commit a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 · built 2026-11-04T12:00:00.000Z",
  );
});

test("[boundary-12] a known gitRef is not part of the banner either", () => {
  assert.equal(
    buildBanner("api", knownWith({ gitRef: "v1.4.2" })),
    "api 0.3.0+a1b2c3d · commit a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 · built 2026-11-04T12:00:00.000Z",
  );
});

// ---------------------------------------------------------------- boundary-13

test("[boundary-13] the banner name is used verbatim", () => {
  assert.doesNotThrow(() => buildBanner("", unknownBuildInfo));
  assert.equal(buildBanner("", unknownBuildInfo), " 0.0.0");
  assert.doesNotThrow(() => buildBanner("  api ", unknownBuildInfo));
  assert.equal(buildBanner("  api ", unknownBuildInfo), "  api  0.0.0");
});

test("[boundary-13] an empty name is used verbatim on an identified build", () => {
  assert.equal(
    buildBanner("", known),
    " 0.3.0+a1b2c3d · commit a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 · built 2026-11-04T12:00:00.000Z",
  );
});

// ---------------------------------------------------------------- boundary-14

test("[boundary-14] the functions leave their arguments as they were and repeat their results", () => {
  const input = { ...known };
  const copy = structuredClone(known);
  const first = [
    formatVersion(input),
    isIdentified(input),
    commitUrl(input),
    buildBanner("api", input),
    sameBuild(input, input),
  ];
  assert.deepEqual(input, copy);
  const second = [
    formatVersion(input),
    isIdentified(input),
    commitUrl(input),
    buildBanner("api", input),
    sameBuild(input, input),
  ];
  assert.deepEqual(second, first);
  assert.deepEqual(input, copy);
});

test("[boundary-14] the functions leave unknownBuildInfo as it was and repeat their results", () => {
  const first = [
    formatVersion(unknownBuildInfo),
    isIdentified(unknownBuildInfo),
    commitUrl(unknownBuildInfo),
    buildBanner("api", unknownBuildInfo),
    sameBuild(unknownBuildInfo, known),
  ];
  assert.deepEqual(unknownBuildInfo, expectedUnknown);
  const second = [
    formatVersion(unknownBuildInfo),
    isIdentified(unknownBuildInfo),
    commitUrl(unknownBuildInfo),
    buildBanner("api", unknownBuildInfo),
    sameBuild(unknownBuildInfo, known),
  ];
  assert.deepEqual(second, first);
  assert.deepEqual(unknownBuildInfo, expectedUnknown);
  assert.deepEqual(known.gitSha, SHA);
});

// ---------------------------------------------------------------- unhappy-1

test("[unhappy-1] a missing required field is rejected", () => {
  for (const field of allFields) {
    assert.equal(buildInfoSchema.safeParse(knownWithout(field)).success, false, field);
  }
});

test("[unhappy-1] a required field explicitly set to undefined is rejected", () => {
  for (const field of allFields) {
    assert.equal(
      buildInfoSchema.safeParse({ ...known, [field]: undefined }).success,
      false,
      field,
    );
  }
});

// ---------------------------------------------------------------- unhappy-2

test("[unhappy-2] invalid field values are rejected", () => {
  const examples: Array<[(typeof allFields)[number], unknown]> = [
    ["version", ""],
    ["version", 3],
    ["gitSha", ""],
    ["gitShortSha", ""],
    ["buildTime", ""],
    ["gitRef", ""],
    ["dirty", "false"],
    ["dirty", null],
  ];
  for (const [field, value] of examples) {
    assert.equal(
      buildInfoSchema.safeParse({ ...known, [field]: value }).success,
      false,
      `${field} ${String(value)}`,
    );
  }
});

test("[unhappy-2] a numeric dirty and a null string field are rejected", () => {
  assert.equal(buildInfoSchema.safeParse({ ...known, dirty: 0 }).success, false);
  assert.equal(buildInfoSchema.safeParse({ ...known, dirty: "true" }).success, false);
  assert.equal(buildInfoSchema.safeParse({ ...known, gitSha: null }).success, false);
});

// ---------------------------------------------------------------- unhappy-3

test("[unhappy-3] malformed version responses are rejected", () => {
  const bodies: unknown[] = [{}, { build: known }, { ...known, gitSha: "" }, null];
  for (const body of bodies) {
    assert.equal(versionResponseSchema.safeParse(body).success, false, JSON.stringify(body));
  }
});

test("[unhappy-3] a version response that is undefined, a list or a JSON string is rejected", () => {
  const bodies: unknown[] = [undefined, [known], JSON.stringify(known)];
  for (const body of bodies) {
    assert.equal(versionResponseSchema.safeParse(body).success, false, String(body));
  }
});

// ---------------------------------------------------------------- unhappy-4

test("[unhappy-4] no URL without a commit", () => {
  assert.equal(commitUrl(knownWith({ gitSha: "unknown" })), undefined);
  assert.equal(commitUrl(unknownBuildInfo), undefined);
});

test("[unhappy-4] no URL without a commit even when the short SHA is known", () => {
  assert.equal(commitUrl(unknownWith({ gitShortSha: "a1b2c3d" })), undefined);
});
