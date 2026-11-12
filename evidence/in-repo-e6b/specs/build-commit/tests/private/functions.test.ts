import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBanner,
  commitUrl,
  formatVersion,
  isIdentified,
  sameBuild,
  unknownBuildInfo,
  type BuildInfoDto,
} from "../../src/build-info.js";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const OTHER_SHA = "0123456789abcdef0123456789abcdef01234567";
const REPO = "https://github.com/lunox-work/sandbox-factory";
const KNOWN_URL = `${REPO}/commit/${SHA}`;
const ZERO_SHA = "0".repeat(40);
const F_SHA = "f".repeat(40);
// Shares its first 7 characters with SHA and differs further on.
const SAME_PREFIX_SHA = "a1b2c3d0000000000000000000000000000000ff";
// Shares its last 39 characters with SHA and differs in the first.
const FIRST_CHAR_SHA = "b1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
// Same as SHA except for one character in the middle (index 20).
const MIDDLE_CHAR_SHA = "a1b2c3d4e5f60718293a0b5c6d7e8f9012345678";

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

function knownWith(changes: Partial<BuildInfoDto>): BuildInfoDto {
  return { ...known, ...changes };
}

function isBannerNameError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    error.message === "A build banner needs a name."
  );
}

// ---------------------------------------------------------------------------
// [happy-6] Formatting a version

// Extends public "[happy-6] formatVersion shows the version and the 7-character commit":
// other versions and other commits in each of the four combinations.
test("[happy-6] formatVersion with other versions and commits", () => {
  const cases: Array<[string, string, string]> = [
    ["1.2.3", OTHER_SHA, "1.2.3 (0123456)"],
    ["v1", ZERO_SHA, "v1 (0000000)"],
    ["2.0.0", F_SHA, "2.0.0 (fffffff)"],
    ["0.3.0", SAME_PREFIX_SHA, "0.3.0 (a1b2c3d)"],
    ["0.3.0", FIRST_CHAR_SHA, "0.3.0 (b1b2c3d)"],
    ["2.0.0", "unknown", "2.0.0 (unknown)"],
    ["unknown", OTHER_SHA, "unknown (0123456)"],
    ["unknown", F_SHA, "unknown (fffffff)"],
  ];
  for (const [version, commit, text] of cases) {
    assert.equal(
      formatVersion(knownWith({ version, commit })),
      text,
      `${version} ${commit}`,
    );
  }
});

// Extends public "[happy-6] formatVersion keeps a pre-release version and truncates another commit":
// versions are kept exactly as given, including look-alikes of the sentinel.
test("[happy-6] formatVersion keeps unusual versions exactly as given", () => {
  const cases: Array<[string, string]> = [
    ["1.0 (beta)", "1.0 (beta) (a1b2c3d)"],
    ["UNKNOWN", "UNKNOWN (a1b2c3d)"],
    ["x", "x (a1b2c3d)"],
  ];
  for (const [version, text] of cases) {
    assert.equal(formatVersion(knownWith({ version })), text, version);
  }
  assert.equal(
    formatVersion(knownWith({ version: "UNKNOWN", commit: "unknown" })),
    "UNKNOWN (unknown)",
  );
  assert.equal(
    formatVersion(knownWith({ version: " 0.3.0 ", commit: "unknown" })),
    " 0.3.0  (unknown)",
  );
});

// ---------------------------------------------------------------------------
// [boundary-3] builtAt and repository do not affect the text

// Extends public "[boundary-3] formatVersion ignores unknown builtAt and repository":
// each of builtAt and repository unknown on its own, with other version/commit.
test("[boundary-3] formatVersion is unaffected by builtAt or repository alone being unknown", () => {
  const base = knownWith({ version: "1.2.3", commit: OTHER_SHA });
  const variants: BuildInfoDto[] = [
    base,
    { ...base, builtAt: "unknown" },
    { ...base, repository: "unknown" },
    { ...base, builtAt: "unknown", repository: "unknown" },
    { ...base, builtAt: "2026-11-04T12:00:00Z", repository: `${REPO}.git/` },
  ];
  for (const info of variants) {
    assert.equal(formatVersion(info), "1.2.3 (0123456)", JSON.stringify(info));
  }
});

// Extends public "[boundary-3] formatVersion ignores other known builtAt and repository values":
// with version or commit unknown, builtAt and repository still do not show.
test("[boundary-3] formatVersion leaves out builtAt and repository when version or commit is unknown", () => {
  assert.equal(
    formatVersion(knownWith({ version: "unknown" })),
    "unknown (a1b2c3d)",
  );
  assert.equal(
    formatVersion(knownWith({ commit: "unknown", repository: "unknown" })),
    "0.3.0 (unknown)",
  );
  assert.equal(
    formatVersion(knownWith({ version: "unknown", builtAt: "unknown" })),
    "unknown (a1b2c3d)",
  );
});

// ---------------------------------------------------------------------------
// [boundary-4] The unknown build info (formatVersion)

// Extends public "[boundary-4] formatVersion of unknownBuildInfo is "unknown"":
// an all-unknown copy that is not the exported object.
test("[boundary-4] formatVersion of an all-unknown copy is \"unknown\"", () => {
  assert.equal(formatVersion({ ...allUnknown }), "unknown");
  assert.equal(formatVersion({ ...unknownBuildInfo }), "unknown");
});

// ---------------------------------------------------------------------------
// [happy-7] Identifying a build

// Extends public "[happy-7] isIdentified depends on the commit alone":
// more commits, each with the other fields both known and unknown.
test("[happy-7] isIdentified is true for any known commit whatever the other fields", () => {
  for (const commit of [SHA, OTHER_SHA, ZERO_SHA, F_SHA, SAME_PREFIX_SHA]) {
    assert.equal(isIdentified(knownWith({ commit })), true, commit);
    assert.equal(isIdentified({ ...allUnknown, commit }), true, commit);
    assert.equal(
      isIdentified(knownWith({ commit, version: "unknown" })),
      true,
      commit,
    );
  }
});

// Extends public "[happy-7] isIdentified is true for another known commit":
// an unknown commit is not identified whichever other fields are known.
test("[happy-7] isIdentified is false for an unknown commit with any other fields", () => {
  const variants: BuildInfoDto[] = [
    knownWith({ commit: "unknown" }),
    knownWith({ commit: "unknown", version: "unknown" }),
    knownWith({ commit: "unknown", builtAt: "unknown" }),
    knownWith({ commit: "unknown", repository: "unknown" }),
    knownWith({ commit: "unknown", version: "9.9.9", repository: "https://example.com" }),
  ];
  for (const info of variants) {
    assert.equal(isIdentified(info), false, JSON.stringify(info));
  }
});

// ---------------------------------------------------------------------------
// [boundary-5] The unknown build info is not identified

// Extends public "[boundary-5] isIdentified of a mutable copy of unknownBuildInfo is false":
// an independently built all-unknown object, and the exported one again.
test("[boundary-5] isIdentified of an independent all-unknown build info is false", () => {
  assert.equal(isIdentified(allUnknown), false);
  assert.equal(isIdentified(unknownBuildInfo), false);
});

// ---------------------------------------------------------------------------
// [happy-8] URL for a known commit

// Extends public "[happy-8] commitUrl uses the full commit for another repository and SHA":
// more repositories and commits.
test("[happy-8] commitUrl links the full commit for other repositories and commits", () => {
  const cases: Array<[string, string, string]> = [
    [REPO, OTHER_SHA, `${REPO}/commit/${OTHER_SHA}`],
    [REPO, ZERO_SHA, `${REPO}/commit/${ZERO_SHA}`],
    [
      "https://gitlab.example.org/group/sub/project",
      F_SHA,
      `https://gitlab.example.org/group/sub/project/commit/${F_SHA}`,
    ],
    [
      "https://example.com:8443/team/repo",
      SHA,
      `https://example.com:8443/team/repo/commit/${SHA}`,
    ],
    ["https://example.com", SHA, `https://example.com/commit/${SHA}`],
  ];
  for (const [repository, commit, url] of cases) {
    assert.equal(commitUrl(knownWith({ repository, commit })), url, repository);
  }
});

// ---------------------------------------------------------------------------
// [boundary-6] Trailing slashes, then one trailing ".git", are removed

// Extends public "[boundary-6] commitUrl removes trailing slashes and then one trailing .git":
// more slashes, .git with several slashes, and other repositories.
test("[boundary-6] commitUrl removes any number of trailing slashes before one .git", () => {
  const cases: Array<[string, string]> = [
    [`${REPO}///`, KNOWN_URL],
    [`${REPO}/////`, KNOWN_URL],
    [`${REPO}.git//`, KNOWN_URL],
    [`${REPO}.git///`, KNOWN_URL],
    ["https://example.com/", `https://example.com/commit/${SHA}`],
    ["https://example.com//", `https://example.com/commit/${SHA}`],
    ["https://example.com/team/repo.git", `https://example.com/team/repo/commit/${SHA}`],
    ["https://example.com/team/repo.git.git/", `https://example.com/team/repo.git/commit/${SHA}`],
  ];
  for (const [repository, url] of cases) {
    assert.equal(commitUrl(knownWith({ repository })), url, repository);
  }
});

// Extends public "[boundary-6] commitUrl removes only one trailing .git":
// only a trailing ".git" is removed; ".git" elsewhere, or "git" without the dot, stays.
test("[boundary-6] commitUrl keeps .git that is not at the end and git without a dot", () => {
  const cases: Array<[string, string]> = [
    ["https://example.com/team.git/repo", `https://example.com/team.git/repo/commit/${SHA}`],
    ["https://example.com/team/repogit", `https://example.com/team/repogit/commit/${SHA}`],
    ["https://example.com/team/repo.github", `https://example.com/team/repo.github/commit/${SHA}`],
    ["https://git.example.com/team/repo", `https://git.example.com/team/repo/commit/${SHA}`],
    ["https://example.com/team.git/repo.git", `https://example.com/team.git/repo/commit/${SHA}`],
  ];
  for (const [repository, url] of cases) {
    assert.equal(commitUrl(knownWith({ repository })), url, repository);
  }
});

// The slashes come off first and then the ".git"; slashes left in front of
// that ".git" are not removed again.
test("[boundary-6] commitUrl removes trailing slashes before .git, not after it", () => {
  assert.equal(
    commitUrl(knownWith({ repository: "https://example.com/team/repo/.git" })),
    `https://example.com/team/repo//commit/${SHA}`,
  );
});

// ---------------------------------------------------------------------------
// [unhappy-5] No URL without both a commit and a repository

// Extends public "[unhappy-5] commitUrl is undefined when commit or repository is unknown":
// other known partners, and every other field known or unknown.
test("[unhappy-5] commitUrl is undefined for an unknown commit or repository with other values", () => {
  const variants: BuildInfoDto[] = [
    knownWith({ commit: "unknown", repository: "https://example.com/team/repo" }),
    knownWith({ commit: "unknown", repository: "https://example.com" }),
    knownWith({ commit: OTHER_SHA, repository: "unknown" }),
    knownWith({ commit: F_SHA, repository: "unknown", version: "unknown", builtAt: "unknown" }),
    knownWith({ commit: "unknown", version: "unknown", builtAt: "unknown" }),
    { ...allUnknown },
    unknownBuildInfo,
  ];
  for (const info of variants) {
    assert.equal(commitUrl(info), undefined, JSON.stringify(info));
  }
});

// Extends public "[unhappy-5] commitUrl is undefined for an unknown commit even with a trailing-slash repository":
// the "unknown" commit is never put into a URL, whatever the repository looks like.
test("[unhappy-5] commitUrl is undefined for an unknown commit with any repository form", () => {
  for (const repository of [
    REPO,
    `${REPO}/`,
    `${REPO}.git`,
    "https://example.com/team/repo.git.git",
  ]) {
    assert.equal(
      commitUrl(knownWith({ commit: "unknown", repository })),
      undefined,
      repository,
    );
  }
});

// ---------------------------------------------------------------------------
// [boundary-7] version and builtAt do not matter

// Extends public "[boundary-7] commitUrl ignores unknown version and builtAt":
// each one alone, with other repositories and commits.
test("[boundary-7] commitUrl ignores version and builtAt for other repositories and commits", () => {
  const repository = "https://example.com/team/repo.git/";
  const url = `https://example.com/team/repo/commit/${OTHER_SHA}`;
  const variants: BuildInfoDto[] = [
    knownWith({ commit: OTHER_SHA, repository }),
    knownWith({ commit: OTHER_SHA, repository, version: "unknown" }),
    knownWith({ commit: OTHER_SHA, repository, builtAt: "unknown" }),
    knownWith({ commit: OTHER_SHA, repository, version: "unknown", builtAt: "unknown" }),
    { ...allUnknown, commit: OTHER_SHA, repository },
  ];
  for (const info of variants) {
    assert.equal(commitUrl(info), url, JSON.stringify(info));
  }
});

// ---------------------------------------------------------------------------
// [happy-9] Same commit, different build details

// Extends public "[happy-9] sameBuild is true for the same commit with different details":
// other commits, in both argument orders, with details differing in each field.
test("[happy-9] sameBuild is true for other shared commits whatever the details", () => {
  for (const commit of [OTHER_SHA, ZERO_SHA, F_SHA]) {
    const a = knownWith({ commit });
    const others: BuildInfoDto[] = [
      { ...a, version: "9.9.9" },
      { ...a, builtAt: "2020-01-01T00:00:00Z" },
      { ...a, repository: `${REPO}.git/` },
      { ...allUnknown, commit },
    ];
    for (const b of others) {
      assert.equal(sameBuild(a, b), true, `${commit} ${JSON.stringify(b)}`);
      assert.equal(sameBuild(b, a), true, `${commit} ${JSON.stringify(b)}`);
    }
  }
});

// Extends public "[happy-9] sameBuild is true when the other build's details are all unknown":
// both builds have everything but the commit unknown.
test("[happy-9] sameBuild is true for two builds that know only the same commit", () => {
  assert.equal(
    sameBuild({ ...allUnknown, commit: SHA }, { ...allUnknown, commit: SHA }),
    true,
  );
});

// ---------------------------------------------------------------------------
// [happy-10] Different commits

// Extends public "[happy-10] sameBuild is false for commits that differ only in the last character":
// commits that share a 7-character prefix or differ only in the first character.
test("[happy-10] sameBuild is false for commits sharing a short prefix or differing at the start", () => {
  const pairs: Array<[string, string]> = [
    [SHA, SAME_PREFIX_SHA],
    [SHA, FIRST_CHAR_SHA],
    [SHA, MIDDLE_CHAR_SHA],
    [ZERO_SHA, F_SHA],
    [OTHER_SHA, SHA],
  ];
  for (const [x, y] of pairs) {
    assert.equal(sameBuild(knownWith({ commit: x }), knownWith({ commit: y })), false, `${x} ${y}`);
    assert.equal(sameBuild(knownWith({ commit: y }), knownWith({ commit: x })), false, `${y} ${x}`);
  }
});

// Extends public "[happy-10] sameBuild is false for different commits":
// different commits are not the same build even when the other details are all unknown or identical.
test("[happy-10] sameBuild is false for different commits with matching details", () => {
  assert.equal(
    sameBuild({ ...allUnknown, commit: SHA }, { ...allUnknown, commit: OTHER_SHA }),
    false,
  );
  assert.equal(
    sameBuild(
      knownWith({ commit: OTHER_SHA, version: "0.4.0" }),
      knownWith({ commit: SHA, version: "0.4.0" }),
    ),
    false,
  );
});

// ---------------------------------------------------------------------------
// [unhappy-6] An unknown commit is never the same build

// Extends public "[unhappy-6] sameBuild is false whenever a commit is unknown":
// an unknown commit against every other kind of build, both orders, with otherwise identical details.
test("[unhappy-6] sameBuild is false for an unknown commit against any build", () => {
  const commitUnknown = knownWith({ commit: "unknown" });
  const partners: BuildInfoDto[] = [
    known,
    knownWith({ commit: OTHER_SHA }),
    { ...allUnknown, commit: SHA },
    { ...commitUnknown },
    { ...allUnknown },
    unknownBuildInfo,
    knownWith({ commit: "unknown", version: "unknown" }),
  ];
  for (const b of partners) {
    assert.equal(sameBuild(commitUnknown, b), false, JSON.stringify(b));
    assert.equal(sameBuild(b, commitUnknown), false, JSON.stringify(b));
  }
});

// Extends public "[unhappy-6] sameBuild is false for the very same object with an unknown commit":
// independent all-unknown objects, and the exported one with a copy of itself.
test("[unhappy-6] sameBuild is false for any two all-unknown builds", () => {
  assert.equal(sameBuild({ ...allUnknown }, { ...allUnknown }), false);
  assert.equal(sameBuild(unknownBuildInfo, { ...allUnknown }), false);
  assert.equal(sameBuild({ ...allUnknown }, unknownBuildInfo), false);
  const same = { ...allUnknown };
  assert.equal(sameBuild(same, same), false);
});

// ---------------------------------------------------------------------------
// [boundary-8] A build is the same as itself when identified

// Extends public "[boundary-8] sameBuild is true for two separate copies of known":
// other identified builds, compared with themselves and with deep copies.
test("[boundary-8] sameBuild is true for any identified build with itself", () => {
  const builds: BuildInfoDto[] = [
    knownWith({ commit: OTHER_SHA }),
    knownWith({ commit: ZERO_SHA, version: "unknown" }),
    { ...allUnknown, commit: F_SHA },
    knownWith({ repository: "unknown", builtAt: "unknown" }),
  ];
  for (const info of builds) {
    assert.equal(sameBuild(info, info), true, JSON.stringify(info));
    assert.equal(sameBuild(info, structuredClone(info)), true, JSON.stringify(info));
  }
});

// ---------------------------------------------------------------------------
// [boundary-9] The result does not depend on argument order

// Extends public "[boundary-9] sameBuild is symmetric for matching commits and for an unknown commit":
// every ordered pair of a larger set of builds.
test("[boundary-9] sameBuild is symmetric across every pair of a set of builds", () => {
  const builds: BuildInfoDto[] = [
    known,
    knownWith({ version: "0.4.0", repository: "https://example.com/team/repo" }),
    knownWith({ commit: OTHER_SHA }),
    knownWith({ commit: SAME_PREFIX_SHA }),
    knownWith({ commit: "unknown" }),
    { ...allUnknown, commit: SHA },
    { ...allUnknown },
    unknownBuildInfo,
  ];
  for (const a of builds) {
    for (const b of builds) {
      assert.equal(sameBuild(a, b), sameBuild(b, a), `${JSON.stringify(a)} ${JSON.stringify(b)}`);
    }
  }
});

// ---------------------------------------------------------------------------
// [happy-11] Banners

// Extends public "[happy-11] buildBanner joins the trimmed name, formatVersion and the build time":
// other names, versions, commits and build times.
test("[happy-11] buildBanner with other names, versions, commits and build times", () => {
  const cases: Array<[string, BuildInfoDto, string]> = [
    [
      "extension",
      knownWith({ version: "1.2.3", commit: OTHER_SHA, builtAt: "2026-11-05T08:30:00.000Z" }),
      "extension 1.2.3 (0123456) built 2026-11-05T08:30:00.000Z",
    ],
    [
      "web",
      knownWith({ builtAt: "2026-11-04T12:00:00Z" }),
      "web 0.3.0 (a1b2c3d) built 2026-11-04T12:00:00Z",
    ],
    [
      "web",
      knownWith({ builtAt: "2026-11-04T12:00:00.123456Z" }),
      "web 0.3.0 (a1b2c3d) built 2026-11-04T12:00:00.123456Z",
    ],
    [
      "api",
      knownWith({ version: "unknown" }),
      "api unknown (a1b2c3d) built 2026-11-04T12:00:00.000Z",
    ],
    [
      "api",
      knownWith({ commit: "unknown", builtAt: "unknown" }),
      "api 0.3.0 (unknown)",
    ],
    [
      "api",
      knownWith({ version: "unknown", builtAt: "unknown" }),
      "api unknown (a1b2c3d)",
    ],
    [
      "api",
      knownWith({ version: "unknown", commit: "unknown", builtAt: "unknown" }),
      "api unknown",
    ],
  ];
  for (const [name, info, banner] of cases) {
    assert.equal(buildBanner(name, info), banner, banner);
  }
});

// Extends public "[happy-11] buildBanner shows the build time even when version and commit are unknown":
// the name is trimmed of all surrounding whitespace, and only that.
test("[happy-11] buildBanner trims tabs and newlines around the name and keeps inner spaces", () => {
  const banner = "0.3.0 (a1b2c3d) built 2026-11-04T12:00:00.000Z";
  assert.equal(buildBanner("\tweb\n", known), `web ${banner}`);
  assert.equal(buildBanner("   extension", known), `extension ${banner}`);
  assert.equal(buildBanner("api   ", known), `api ${banner}`);
  assert.equal(buildBanner(" my api ", known), `my api ${banner}`);
  assert.equal(buildBanner("a", known), `a ${banner}`);
  assert.equal(buildBanner("API", known), `API ${banner}`);
});

// ---------------------------------------------------------------------------
// [boundary-10] Banner for the unknown build info

// Extends public "[boundary-10] buildBanner trims the name for unknownBuildInfo too":
// other names, and an all-unknown copy.
test("[boundary-10] buildBanner for an all-unknown build is \"<name> unknown\" for any name", () => {
  assert.equal(buildBanner("api", unknownBuildInfo), "api unknown");
  assert.equal(buildBanner("web", { ...allUnknown }), "web unknown");
  assert.equal(buildBanner("\textension\n", { ...allUnknown }), "extension unknown");
});

// ---------------------------------------------------------------------------
// [boundary-11] The repository is not part of the banner

// Extends public "[boundary-11] buildBanner leaves out another known repository":
// several repositories, with other names and with builtAt unknown.
test("[boundary-11] buildBanner never includes the repository or a commit URL", () => {
  for (const repository of [
    REPO,
    `${REPO}.git/`,
    "https://example.com",
    "unknown",
  ]) {
    assert.equal(
      buildBanner("web", knownWith({ repository })),
      "web 0.3.0 (a1b2c3d) built 2026-11-04T12:00:00.000Z",
      repository,
    );
    assert.equal(
      buildBanner("web", knownWith({ repository, builtAt: "unknown" })),
      "web 0.3.0 (a1b2c3d)",
      repository,
    );
  }
});

// ---------------------------------------------------------------------------
// [unhappy-7] An empty name is rejected

// Extends public "[unhappy-7] buildBanner rejects a whitespace-only name":
// other whitespace, including tabs and newlines.
test("[unhappy-7] buildBanner rejects names that are only tabs, newlines or spaces", () => {
  for (const name of [" ", "\t", "\n", " \t\n ", "\r\n"]) {
    assert.throws(() => buildBanner(name, known), isBannerNameError, JSON.stringify(name));
  }
});

// Extends public "[unhappy-7] buildBanner rejects an empty name":
// the name is checked whatever the build info is.
test("[unhappy-7] buildBanner rejects an empty name for unknown and partly known builds", () => {
  const infos: BuildInfoDto[] = [
    unknownBuildInfo,
    { ...allUnknown },
    knownWith({ builtAt: "unknown" }),
    knownWith({ commit: "unknown" }),
  ];
  for (const info of infos) {
    assert.throws(() => buildBanner("", info), isBannerNameError, JSON.stringify(info));
    assert.throws(() => buildBanner("  ", info), isBannerNameError, JSON.stringify(info));
  }
});

// ---------------------------------------------------------------------------
// [boundary-12] Arguments are left as they were

function deepFreeze(info: BuildInfoDto): BuildInfoDto {
  return Object.freeze({ ...info });
}

// Extends public "[boundary-12] the functions leave known unchanged and return the same results again":
// frozen inputs (so any write throws), repositories the URL trimming applies to,
// and two distinct arguments to sameBuild.
test("[boundary-12] the functions do not write to frozen arguments and repeat their results", () => {
  const inputs: BuildInfoDto[] = [
    known,
    knownWith({ repository: `${REPO}.git//` }),
    knownWith({ commit: "unknown", builtAt: "unknown" }),
    knownWith({ commit: OTHER_SHA, version: "unknown", repository: "https://example.com/team/repo.git" }),
  ];
  for (const input of inputs) {
    const info = deepFreeze(input);
    const other = deepFreeze(knownWith({ commit: OTHER_SHA }));
    const copy = structuredClone(input);
    const call = () => [
      formatVersion(info),
      isIdentified(info),
      commitUrl(info),
      buildBanner("  api ", info),
      sameBuild(info, other),
      sameBuild(other, info),
      sameBuild(info, info),
    ];
    const first = call();
    assert.deepEqual({ ...info }, copy);
    assert.deepEqual(call(), first);
    assert.deepEqual({ ...info }, copy);
  }
});

// Extends public "[boundary-12] the functions accept frozen unknownBuildInfo and return the same results again":
// unfrozen inputs keep their exact keys and values after many calls.
test("[boundary-12] unfrozen arguments keep their keys and values across repeated calls", () => {
  const info: BuildInfoDto = knownWith({ repository: `${REPO}/` });
  const partner: BuildInfoDto = { ...allUnknown };
  const results = new Set<string>();
  for (let i = 0; i < 5; i += 1) {
    results.add(
      JSON.stringify([
        formatVersion(info),
        isIdentified(info),
        commitUrl(info),
        buildBanner("web", info),
        sameBuild(info, partner),
        sameBuild(partner, info),
      ]),
    );
  }
  assert.equal(results.size, 1);
  assert.deepEqual(info, knownWith({ repository: `${REPO}/` }));
  assert.deepEqual(Object.keys(info), ["version", "commit", "builtAt", "repository"]);
  assert.deepEqual(partner, allUnknown);
});
