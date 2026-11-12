import assert from "node:assert/strict";
import { test } from "node:test";

import {
  UNKNOWN_BUILD,
  buildBanner,
  buildInfoSchema,
  commitUrl,
  formatVersion,
  isIdentified,
  sameBuild,
  unknownBuildInfo,
  versionResponseSchema,
  type BuildInfoDto,
} from "../src/build-info.js";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const OTHER_SHA = "0123456789abcdef0123456789abcdef01234567";
const REPO = "https://github.com/lunox-work/sandbox-factory";
const KNOWN_URL = `${REPO}/commit/${SHA}`;

const known: BuildInfoDto = {
  version: "0.3.0",
  commit: SHA,
  builtAt: "2026-11-04T12:00:00.000Z",
  repository: REPO,
};

const fields = ["version", "commit", "builtAt", "repository"] as const;

function knownWith(changes: Partial<BuildInfoDto>): BuildInfoDto {
  return { ...known, ...changes };
}

function without(field: (typeof fields)[number]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...known };
  delete copy[field];
  return copy;
}

function isBannerNameError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    error.message === "A build banner needs a name."
  );
}

// [happy-1] The unknown build info

test("[happy-1] UNKNOWN_BUILD is \"unknown\" and unknownBuildInfo uses it for every field", () => {
  assert.equal(UNKNOWN_BUILD, "unknown");
  assert.deepEqual(unknownBuildInfo, {
    version: "unknown",
    commit: "unknown",
    builtAt: "unknown",
    repository: "unknown",
  });
});

test("[happy-1] buildInfoSchema parses unknownBuildInfo to an equal value", () => {
  assert.deepEqual(buildInfoSchema.parse(unknownBuildInfo), unknownBuildInfo);
});

// [unhappy-1] unknownBuildInfo cannot be modified

test("[unhappy-1] assigning to unknownBuildInfo.version throws a TypeError and changes nothing", () => {
  assert.throws(() => {
    unknownBuildInfo.version = "0.3.0";
  }, TypeError);
  assert.equal(unknownBuildInfo.version, "unknown");
});

test("[unhappy-1] unknownBuildInfo is frozen, so assigning to commit also throws", () => {
  assert.ok(Object.isFrozen(unknownBuildInfo));
  assert.throws(() => {
    unknownBuildInfo.commit = SHA;
  }, TypeError);
  assert.equal(unknownBuildInfo.commit, "unknown");
});

// [happy-2] A fully known build info parses to itself

test("[happy-2] buildInfoSchema parses the known build info to itself", () => {
  assert.deepEqual(buildInfoSchema.parse(known), known);
});

test("[happy-2] buildInfoSchema parses another fully known build info to itself", () => {
  const other: BuildInfoDto = {
    version: "0.4.0",
    commit: OTHER_SHA,
    builtAt: "2026-11-05T08:30:00.000Z",
    repository: "https://example.com/team/repo",
  };
  assert.deepEqual(buildInfoSchema.parse(other), other);
});

// [happy-3] Any single field may be "unknown"

test("[happy-3] each single field may be \"unknown\"", () => {
  for (const field of fields) {
    const result = buildInfoSchema.safeParse(knownWith({ [field]: "unknown" }));
    assert.equal(result.success, true, field);
    if (result.success) {
      assert.equal(result.data[field], "unknown", field);
    }
  }
});

test("[happy-3] an unknown commit leaves the other known fields as given", () => {
  const input = knownWith({ commit: "unknown" });
  assert.deepEqual(buildInfoSchema.parse(input), input);
});

// [boundary-1] Unknown keys are dropped

test("[boundary-1] an extra \"branch\" key is dropped from the parse result", () => {
  const result = buildInfoSchema.parse({ ...known, branch: "main" });
  assert.equal("branch" in result, false);
  assert.deepEqual(result, known);
});

test("[boundary-1] several extra keys are all dropped without an error", () => {
  const result = buildInfoSchema.safeParse({
    ...known,
    branch: "main",
    dirty: true,
    tag: "unknown",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data, known);
  }
});

// [boundary-2] Accepted edge values

test("[boundary-2] accepted edge values parse unchanged", () => {
  const cases: Array<[(typeof fields)[number], string]> = [
    ["version", "v1"],
    ["version", "0.3.0-rc.1+build.7"],
    ["builtAt", "2026-11-04T12:00:00Z"],
    ["repository", "https://github.com/lunox-work/sandbox-factory/"],
    ["repository", "https://example.com/team/repo.git"],
  ];
  for (const [field, value] of cases) {
    const result = buildInfoSchema.safeParse(knownWith({ [field]: value }));
    assert.equal(result.success, true, `${field}=${value}`);
    if (result.success) {
      assert.equal(result.data[field], value, `${field}=${value}`);
    }
  }
});

test("[boundary-2] a version with surrounding spaces is non-empty and kept as given", () => {
  const result = buildInfoSchema.parse(knownWith({ version: " 0.3.0 " }));
  assert.equal(result.version, " 0.3.0 ");
});

// [unhappy-2] A missing required field is rejected

test("[unhappy-2] each missing required field is rejected", () => {
  for (const field of fields) {
    assert.equal(buildInfoSchema.safeParse(without(field)).success, false, field);
  }
});

test("[unhappy-2] an empty object is rejected", () => {
  assert.equal(buildInfoSchema.safeParse({}).success, false);
});

// [unhappy-3] Invalid field values are rejected

test("[unhappy-3] invalid field values are rejected", () => {
  const cases: Array<[(typeof fields)[number], unknown]> = [
    ["version", ""],
    ["version", 3],
    ["commit", "a1b2c3d"],
    ["commit", "a1b2c3d4e5f60718293a4b5c6d7e8f901234567"],
    ["commit", "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789"],
    ["commit", "A1B2C3D4E5F60718293A4B5C6D7E8F9012345678"],
    ["commit", "g1b2c3d4e5f60718293a4b5c6d7e8f9012345678"],
    ["commit", "Unknown"],
    ["commit", ""],
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
      buildInfoSchema.safeParse({ ...known, [field]: value }).success,
      false,
      `${field}=${String(value)}`,
    );
  }
});

test("[unhappy-3] a 64-character SHA-256 commit is rejected", () => {
  assert.equal(
    buildInfoSchema.safeParse({ ...known, commit: SHA + SHA.slice(0, 24) })
      .success,
    false,
  );
});

// [happy-4] A version response parses

test("[happy-4] versionResponseSchema parses { build: known }", () => {
  assert.deepEqual(versionResponseSchema.parse({ build: known }), {
    build: known,
  });
});

test("[happy-4] versionResponseSchema drops unknown keys inside build", () => {
  assert.deepEqual(
    versionResponseSchema.parse({ build: { ...known, branch: "main" } }),
    { build: known },
  );
});

// [happy-5] A version response for an unknown build parses

test("[happy-5] versionResponseSchema parses { build: unknownBuildInfo }", () => {
  assert.deepEqual(versionResponseSchema.parse({ build: unknownBuildInfo }), {
    build: unknownBuildInfo,
  });
});

test("[happy-5] versionResponseSchema parses a build with only the commit unknown", () => {
  const build = knownWith({ commit: "unknown" });
  assert.deepEqual(versionResponseSchema.parse({ build }), { build });
});

// [unhappy-4] Malformed version responses are rejected

test("[unhappy-4] malformed version responses are rejected", () => {
  const bodies: unknown[] = [
    {},
    known,
    { build: { ...known, commit: "a1b2c3d" } },
    { build: null },
  ];
  for (const body of bodies) {
    assert.equal(
      versionResponseSchema.safeParse(body).success,
      false,
      JSON.stringify(body),
    );
  }
});

test("[unhappy-4] a version response whose build lacks a field is rejected", () => {
  assert.equal(
    versionResponseSchema.safeParse({ build: without("repository") }).success,
    false,
  );
});

// [happy-6] Formatting a version

test("[happy-6] formatVersion shows the version and the 7-character commit", () => {
  const cases: Array<[string, string, string]> = [
    ["0.3.0", SHA, "0.3.0 (a1b2c3d)"],
    ["0.3.0", "unknown", "0.3.0 (unknown)"],
    ["unknown", SHA, "unknown (a1b2c3d)"],
    ["unknown", "unknown", "unknown"],
  ];
  for (const [version, commit, text] of cases) {
    assert.equal(formatVersion(knownWith({ version, commit })), text);
  }
});

test("[happy-6] formatVersion keeps a pre-release version and truncates another commit", () => {
  assert.equal(
    formatVersion(
      knownWith({ version: "0.3.0-rc.1+build.7", commit: OTHER_SHA }),
    ),
    "0.3.0-rc.1+build.7 (0123456)",
  );
});

// [boundary-3] builtAt and repository do not affect the text

test("[boundary-3] formatVersion ignores unknown builtAt and repository", () => {
  assert.equal(
    formatVersion(knownWith({ builtAt: "unknown", repository: "unknown" })),
    "0.3.0 (a1b2c3d)",
  );
});

test("[boundary-3] formatVersion ignores other known builtAt and repository values", () => {
  assert.equal(
    formatVersion(
      knownWith({
        builtAt: "2026-11-05T08:30:00.000Z",
        repository: "https://example.com/team/repo",
      }),
    ),
    "0.3.0 (a1b2c3d)",
  );
});

// [boundary-4] The unknown build info (formatVersion)

test("[boundary-4] formatVersion of unknownBuildInfo is \"unknown\"", () => {
  assert.equal(formatVersion(unknownBuildInfo), "unknown");
});

test("[boundary-4] formatVersion is \"unknown\" when version and commit are unknown but the rest is known", () => {
  assert.equal(
    formatVersion(knownWith({ version: "unknown", commit: "unknown" })),
    "unknown",
  );
});

// [happy-7] Identifying a build

test("[happy-7] isIdentified depends on the commit alone", () => {
  assert.equal(isIdentified(known), true);
  assert.equal(
    isIdentified(
      knownWith({
        version: "unknown",
        builtAt: "unknown",
        repository: "unknown",
      }),
    ),
    true,
  );
  assert.equal(isIdentified(knownWith({ commit: "unknown" })), false);
});

test("[happy-7] isIdentified is true for another known commit", () => {
  assert.equal(isIdentified(knownWith({ commit: OTHER_SHA })), true);
});

// [boundary-5] The unknown build info is not identified

test("[boundary-5] isIdentified of unknownBuildInfo is false", () => {
  assert.equal(isIdentified(unknownBuildInfo), false);
});

test("[boundary-5] isIdentified of a mutable copy of unknownBuildInfo is false", () => {
  assert.equal(isIdentified({ ...unknownBuildInfo }), false);
});

// [happy-8] URL for a known commit

test("[happy-8] commitUrl links the full commit under the repository", () => {
  assert.equal(commitUrl(known), KNOWN_URL);
});

test("[happy-8] commitUrl uses the full commit for another repository and SHA", () => {
  assert.equal(
    commitUrl(
      knownWith({
        commit: OTHER_SHA,
        repository: "https://example.com/team/repo",
      }),
    ),
    `https://example.com/team/repo/commit/${OTHER_SHA}`,
  );
});

// [boundary-6] Trailing slashes, then one trailing ".git", are removed

test("[boundary-6] commitUrl removes trailing slashes and then one trailing .git", () => {
  const cases: Array<[string, string]> = [
    [`${REPO}/`, KNOWN_URL],
    [`${REPO}//`, KNOWN_URL],
    [`${REPO}.git`, KNOWN_URL],
    [`${REPO}.git/`, KNOWN_URL],
    [
      "https://example.com/team/repo",
      `https://example.com/team/repo/commit/${SHA}`,
    ],
  ];
  for (const [repository, url] of cases) {
    assert.equal(commitUrl(knownWith({ repository })), url, repository);
  }
});

test("[boundary-6] commitUrl removes only one trailing .git", () => {
  assert.equal(
    commitUrl(knownWith({ repository: "https://example.com/team/repo.git.git" })),
    `https://example.com/team/repo.git/commit/${SHA}`,
  );
});

// [unhappy-5] No URL without both a commit and a repository

test("[unhappy-5] commitUrl is undefined when commit or repository is unknown", () => {
  assert.equal(commitUrl(knownWith({ commit: "unknown" })), undefined);
  assert.equal(commitUrl(knownWith({ repository: "unknown" })), undefined);
  assert.equal(
    commitUrl(knownWith({ commit: "unknown", repository: "unknown" })),
    undefined,
  );
});

test("[unhappy-5] commitUrl is undefined for an unknown commit even with a trailing-slash repository", () => {
  assert.equal(
    commitUrl(knownWith({ commit: "unknown", repository: `${REPO}.git/` })),
    undefined,
  );
});

// [boundary-7] version and builtAt do not matter

test("[boundary-7] commitUrl ignores unknown version and builtAt", () => {
  assert.equal(
    commitUrl(knownWith({ version: "unknown", builtAt: "unknown" })),
    KNOWN_URL,
  );
});

test("[boundary-7] commitUrl ignores other known version and builtAt values", () => {
  assert.equal(
    commitUrl(
      knownWith({ version: "9.9.9", builtAt: "2026-11-05T08:30:00.000Z" }),
    ),
    KNOWN_URL,
  );
});

// [happy-9] Same commit, different build details

test("[happy-9] sameBuild is true for the same commit with different details", () => {
  const b = knownWith({
    version: "0.4.0",
    builtAt: "2026-11-05T08:30:00.000Z",
    repository: "https://example.com/team/repo",
  });
  assert.equal(sameBuild(known, b), true);
});

test("[happy-9] sameBuild is true when the other build's details are all unknown", () => {
  const b = knownWith({
    version: "unknown",
    builtAt: "unknown",
    repository: "unknown",
  });
  assert.equal(sameBuild(known, b), true);
});

// [happy-10] Different commits

test("[happy-10] sameBuild is false for different commits", () => {
  assert.equal(sameBuild(known, knownWith({ commit: OTHER_SHA })), false);
});

test("[happy-10] sameBuild is false for commits that differ only in the last character", () => {
  const b = knownWith({ commit: SHA.slice(0, 39) + "9" });
  assert.equal(sameBuild(known, b), false);
});

// [unhappy-6] An unknown commit is never the same build

test("[unhappy-6] sameBuild is false whenever a commit is unknown", () => {
  const pairs: Array<[BuildInfoDto, BuildInfoDto]> = [
    [known, unknownBuildInfo],
    [unknownBuildInfo, known],
    [unknownBuildInfo, unknownBuildInfo],
    [knownWith({ commit: "unknown" }), knownWith({ commit: "unknown" })],
  ];
  for (const [a, b] of pairs) {
    assert.equal(sameBuild(a, b), false);
  }
});

test("[unhappy-6] sameBuild is false for the very same object with an unknown commit", () => {
  const commitUnknown = knownWith({ commit: "unknown" });
  assert.equal(sameBuild(commitUnknown, commitUnknown), false);
});

// [boundary-8] A build is the same as itself when identified

test("[boundary-8] sameBuild(known, known) is true", () => {
  assert.equal(sameBuild(known, known), true);
});

test("[boundary-8] sameBuild is true for two separate copies of known", () => {
  assert.equal(sameBuild({ ...known }, { ...known }), true);
});

// [boundary-9] The result does not depend on argument order

test("[boundary-9] sameBuild gives the same result in either order", () => {
  const b = knownWith({ commit: OTHER_SHA });
  assert.equal(sameBuild(known, b), sameBuild(b, known));
  assert.equal(
    sameBuild(known, unknownBuildInfo),
    sameBuild(unknownBuildInfo, known),
  );
});

test("[boundary-9] sameBuild is symmetric for matching commits and for an unknown commit", () => {
  const sameCommit = knownWith({ version: "0.4.0" });
  const commitUnknown = knownWith({ commit: "unknown" });
  assert.equal(sameBuild(known, sameCommit), sameBuild(sameCommit, known));
  assert.equal(
    sameBuild(known, commitUnknown),
    sameBuild(commitUnknown, known),
  );
});

// [happy-11] Banners

test("[happy-11] buildBanner joins the trimmed name, formatVersion and the build time", () => {
  const cases: Array<[string, BuildInfoDto, string]> = [
    ["api", known, "api 0.3.0 (a1b2c3d) built 2026-11-04T12:00:00.000Z"],
    ["web", knownWith({ builtAt: "unknown" }), "web 0.3.0 (a1b2c3d)"],
    [
      "api",
      knownWith({ commit: "unknown" }),
      "api 0.3.0 (unknown) built 2026-11-04T12:00:00.000Z",
    ],
    ["  api ", known, "api 0.3.0 (a1b2c3d) built 2026-11-04T12:00:00.000Z"],
  ];
  for (const [name, info, banner] of cases) {
    assert.equal(buildBanner(name, info), banner);
  }
});

test("[happy-11] buildBanner shows the build time even when version and commit are unknown", () => {
  assert.equal(
    buildBanner("api", knownWith({ version: "unknown", commit: "unknown" })),
    "api unknown built 2026-11-04T12:00:00.000Z",
  );
});

// [boundary-10] Banner for the unknown build info

test("[boundary-10] buildBanner for unknownBuildInfo is \"extension unknown\"", () => {
  assert.equal(buildBanner("extension", unknownBuildInfo), "extension unknown");
});

test("[boundary-10] buildBanner trims the name for unknownBuildInfo too", () => {
  assert.equal(
    buildBanner("  extension  ", unknownBuildInfo),
    "extension unknown",
  );
});

// [boundary-11] The repository is not part of the banner

test("[boundary-11] buildBanner with an unknown repository", () => {
  assert.equal(
    buildBanner("api", knownWith({ repository: "unknown" })),
    "api 0.3.0 (a1b2c3d) built 2026-11-04T12:00:00.000Z",
  );
});

test("[boundary-11] buildBanner leaves out another known repository", () => {
  assert.equal(
    buildBanner(
      "api",
      knownWith({ repository: "https://example.com/team/repo" }),
    ),
    "api 0.3.0 (a1b2c3d) built 2026-11-04T12:00:00.000Z",
  );
});

// [unhappy-7] An empty name is rejected

test("[unhappy-7] buildBanner rejects an empty name", () => {
  assert.throws(() => buildBanner("", known), isBannerNameError);
});

test("[unhappy-7] buildBanner rejects a whitespace-only name", () => {
  assert.throws(() => buildBanner("   ", known), isBannerNameError);
});

// [boundary-12] Arguments are left as they were

test("[boundary-12] the functions leave known unchanged and return the same results again", () => {
  const info: BuildInfoDto = { ...known };
  const copy = structuredClone(info);
  const call = () => [
    formatVersion(info),
    isIdentified(info),
    commitUrl(info),
    buildBanner("api", info),
    sameBuild(info, info),
  ];
  const first = call();
  assert.deepEqual(info, copy);
  assert.deepEqual(call(), first);
  assert.deepEqual(info, copy);
});

test("[boundary-12] the functions accept frozen unknownBuildInfo and return the same results again", () => {
  const call = () => [
    formatVersion(unknownBuildInfo),
    isIdentified(unknownBuildInfo),
    commitUrl(unknownBuildInfo),
    buildBanner("api", unknownBuildInfo),
    sameBuild(unknownBuildInfo, unknownBuildInfo),
  ];
  const first = call();
  assert.deepEqual(call(), first);
  assert.deepEqual(unknownBuildInfo, {
    version: "unknown",
    commit: "unknown",
    builtAt: "unknown",
    repository: "unknown",
  });
});
