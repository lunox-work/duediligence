import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isRegistryVersion,
  resolveScope,
} from "../../src/sandbox/provenance.js";
import type { DependencyChoice } from "../../src/sandbox/provenance.js";
import { OPERATION_POLICY } from "../../src/slice/manifest.js";
import type { BoundaryContract, SliceManifest } from "../../src/slice/manifest.js";

const manifest: SliceManifest = {
  schemaVersion: 1,
  toolVersion: "slice@4",
  extractorVersion: "typescript@5.9.3",
  sourceSnapshotId: "rsn_1",
  sourceCommitSha: "a".repeat(40),
  graphRunId: "arn_graph",
  graphSha256: "b".repeat(64),
  params: {
    deadlineMinutes: 30,
    graphRunId: "arn_graph",
    entryPoints: ["src/app.ts"],
    budget: { maxFiles: 40, maxDepth: 3 },
    includeInferred: false,
  },
  entryPoints: ["src/app.ts"],
  budget: { maxFiles: 40, maxDepth: 3 },
  included: [
    {
      path: "src/app.ts",
      blobId: "c".repeat(40),
      sha256: "d".repeat(64),
      mode: "100644",
      sizeBytes: 10,
      operations: ["edit"],
    },
  ],
  synthetic: [],
  requiredBuildInputs: { configs: ["package.json"], packages: [] },
  cuts: { outbound: [], inbound: [] },
  internalImports: [],
  externals: { packages: [], environment: [] },
  communities: [0],
  blockers: [],
  policy: OPERATION_POLICY,
  boundaryContractSha256: "f".repeat(64),
  meta: {
    includedFiles: 1,
    includedBytes: 10,
    outboundCuts: 0,
    inboundCuts: 0,
    stubCoverage: "full",
    externals: 0,
    blockers: 0,
    ready: true,
  },
};

const contract: BoundaryContract = {
  schemaVersion: 1,
  toolVersion: "slice@4",
  extractorVersion: "typescript@5.9.3",
  sourceSnapshotId: "rsn_1",
  sourceCommitSha: "a".repeat(40),
  graphRunId: "arn_graph",
  language: "typescript",
  outbound: [],
  inbound: [],
  stubCoverage: "full",
  compilation: {
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: [],
  },
  blockers: [],
};

/** A scope whose only requirement is `name` at `version`, from the public registry. */
const pinnedTo = (
  name: string,
  version: string,
  choices?: Readonly<Record<string, DependencyChoice>>,
) =>
  resolveScope({
    manifest: {
      ...manifest,
      requiredBuildInputs: {
        ...manifest.requiredBuildInputs,
        packages: [
          {
            name,
            version,
            declaredIn: "package.json",
            registry: { source: "public", evidence: "package-lock.json" },
          },
        ],
      },
    },
    contract,
    ...(choices === undefined ? {} : { choices }),
  });

const ALLOWED =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-+^~<>=|* ";

// Extends "[happy-7] semver versions, ranges and dist-tags are registry versions":
// other ranges, tags and prerelease forms, and a very long version.
test("[happy-7] other semver ranges, tags and prereleases, and a long version, are registry versions", () => {
  for (const version of [
    "0.0.0",
    "1.2.3 - 2.3.4",
    "next",
    "beta",
    "canary",
    "=1.0.0",
    "<1",
    ">1.0.0",
    "<=2.0.0",
    "v1.2.3",
    "1.2.3-rc.1",
    "^0.0.0-0",
    "~1.2.3-alpha.0+sha.5114f85",
    "X",
    "x",
    "1.X.x",
    "1 || 2 || 3",
    "^1.0.0 || ^2.0.0 || >=3.0.0 <4.0.0",
    "1.2.3".repeat(5000),
  ])
    assert.equal(isRegistryVersion(version), true, version.slice(0, 40));
});

// Extends "[happy-7] a version made of every allowed character, and each allowed character alone, is a registry version":
// every pair of allowed characters, the set reversed, and the same version asked many times.
test("[happy-7] every pair of allowed characters is a registry version, on every call", () => {
  assert.equal(isRegistryVersion([...ALLOWED].reverse().join("")), true);
  for (const a of ALLOWED)
    for (const b of ALLOWED)
      assert.equal(isRegistryVersion(a + b), true, JSON.stringify(a + b));
  for (let index = 0; index < 5; index += 1) {
    assert.equal(isRegistryVersion("1.2.3"), true);
    assert.equal(isRegistryVersion("workspace:*"), false);
  }
});

// Extends "[unhappy-1] protocols, paths, aliases and shorthands are not registry versions":
// other protocols, paths, aliases and suffixes.
test("[unhappy-1] other protocols, paths, aliases and hashes are not registry versions", () => {
  for (const version of [
    "workspace:^",
    "workspace:~1.0.0",
    "npm:@scope/pkg@1.0.0",
    "git://github.com/a/b.git",
    "git+ssh://git@github.com:a/b.git",
    "github:a/b#v1.0.0",
    "gitlab:a/b",
    "bitbucket:a/b",
    "a/b#main",
    "./local",
    "../shared",
    "/abs/path",
    "~/pkg",
    "C:\\pkg",
    "http://example.com/pkg.tgz",
    "1.0.0#hash",
    "latest@1",
    "portal:../x",
    "patch:zod@3.22.4#patch",
    "catalog:",
    "file:pkg.tgz",
    "1.0.0,2.0.0",
    "(1.0.0)",
    "[1.0.0]",
    "{1.0.0}",
    "'1.0.0'",
    '"1.0.0"',
    "1.0.0;",
    "1.0.0!",
    "1.0.0?",
    "$VERSION",
    "%20",
    "1&2",
    "`1`",
  ])
    assert.equal(isRegistryVersion(version), false, version);
});

// Extends "[unhappy-1] one character outside the allowed set makes an otherwise valid version false, never an exception":
// every other ASCII character, and Unicode characters a case-folding or digit-class test would let in.
test("[unhappy-1] every ASCII character outside the set, and look-alike Unicode, makes a version false", () => {
  const outside: string[] = [];
  for (let code = 0; code < 128; code += 1) {
    const character = String.fromCharCode(code);
    if (!ALLOWED.includes(character)) outside.push(character);
  }
  outside.push(
    "\u212A", // Kelvin sign, folds to k
    "\u017F", // long s, folds to s
    "\u0130", // capital I with dot
    "\u0131", // dotless i
    "\uFF10", // fullwidth zero
    "\u00B2", // superscript two
    "\u0663", // Arabic-Indic three
    "\u00A0", // no-break space
    "\uFEFF", // byte order mark
    "\uD800", // lone surrogate
    "\u2010", // hyphen
    "\u2212", // minus sign
    "\uFF0A", // fullwidth asterisk
  );
  for (const character of outside) {
    const label = JSON.stringify(character);
    assert.equal(isRegistryVersion(character), false, label);
    assert.equal(isRegistryVersion(`1.2${character}.3`), false, label);
    assert.equal(isRegistryVersion(`^1.2.3 ${character}`), false, label);
  }
});

// Extends "[unhappy-1]": a multi-line value whose every line is a registry version is still false.
test("[unhappy-1] a value of several registry-version lines is not a registry version", () => {
  for (const version of [
    "1.2.3\n2.0.0",
    "latest\nlatest",
    "1.2.3\r\n2.0.0",
    "^1\u20282",
    "1".repeat(10000) + "/",
  ])
    assert.equal(isRegistryVersion(version), false, JSON.stringify(version.slice(0, 20)));
});

// Extends "[boundary-11] empty and whitespace edge cases":
// whitespace other than the space, alone and around a version.
test("[boundary-11] whitespace other than the space is refused, alone or around a version", () => {
  for (const space of ["\v", "\f", "\u2028", "\u2029", "\u3000", "\u1680", "\u0085", "\u2003", "\u200B"]) {
    const label = JSON.stringify(space);
    assert.equal(isRegistryVersion(space), false, label);
    assert.equal(isRegistryVersion(`${space}1.2.3`), false, label);
    assert.equal(isRegistryVersion(`1.2.3${space}`), false, label);
  }
  assert.equal(isRegistryVersion("\n1.2.3"), false);
  assert.equal(isRegistryVersion("1.2.3\r"), false);
  assert.equal(isRegistryVersion(""), false);
});

// Extends "[boundary-11] spaces are kept, not trimmed, and other whitespace is refused":
// a long run of spaces, spaces on one side only, and spaces inside a range.
test("[boundary-11] spaces on either side or alone, at any length, are kept and accepted", () => {
  for (const version of [
    " ".repeat(1000),
    " 1.2.3",
    "1.2.3 ",
    "  ^1.0.0   ||   ^2.0.0  ",
    "  ",
  ])
    assert.equal(isRegistryVersion(version), true, JSON.stringify(version.slice(0, 20)));
});

// Extends "[unhappy-2] resolveScope still refuses to install a pin that is not a registry version":
// other names and pins, with and without the owner's approval, each refused exactly as
// isRegistryVersion says.
test("[unhappy-2] resolveScope refuses other non-registry pins, approved or by default", () => {
  const pins = [
    "file:../shared",
    "github:acme/widgets",
    "1.0.0_beta",
    "workspace:*",
    "git+https://github.com/a/b.git",
  ];
  for (const version of pins)
    for (const choices of [undefined, { widgets: "approved-package" as const }]) {
      assert.equal(isRegistryVersion(version), false, version);
      const scope = pinnedTo("widgets", version, choices);
      const item = scope.dependencies.find((dependency) => dependency.name === "widgets");
      assert.equal(item?.resolution, "unresolved", version);
      assert.equal(item?.version, version);
      assert.equal(item?.detail, "Not a registry version: a URL, a path or an alias.");
      assert.deepEqual(scope.blockers, [
        {
          code: "dependency_unresolved",
          detail: `widgets is pinned to ${version}, which is not a registry version.`,
        },
      ]);
    }
});

// Extends "[unhappy-2] resolveScope refuses an empty pin, which isRegistryVersion rejects":
// the whitespace pins the registry test refuses are refused by resolveScope too.
test("[unhappy-2] resolveScope refuses a pin with a newline or a tab, which isRegistryVersion rejects", () => {
  for (const version of ["1.2.3\n", "\t1.2.3", "1.2.3\u00A0"]) {
    assert.equal(isRegistryVersion(version), false, JSON.stringify(version));
    const scope = pinnedTo("@acme/sdk", version, { "@acme/sdk": "approved-package" });
    const item = scope.dependencies.find((dependency) => dependency.name === "@acme/sdk");
    assert.equal(item?.resolution, "unresolved", JSON.stringify(version));
    assert.equal(item?.detail, "Not a registry version: a URL, a path or an alias.");
    assert.ok(
      scope.blockers.some(
        (blocker) =>
          blocker.code === "dependency_unresolved" &&
          blocker.detail === `@acme/sdk is pinned to ${version}, which is not a registry version.`,
      ),
      JSON.stringify(scope.blockers),
    );
  }
});

// Extends "[unhappy-2]": the refusal is of an install only; a mock of the same pin is not refused.
test("[unhappy-2] a pin that is not a registry version is refused only for an install, not for a mock", () => {
  assert.equal(isRegistryVersion("npm:zod@3.22.4"), false);
  const scope = pinnedTo("zod", "npm:zod@3.22.4", { zod: "runtime-mock" });
  const zod = scope.dependencies.find((item) => item.name === "zod");
  assert.equal(zod?.resolution, "runtime-mock");
  assert.deepEqual(scope.blockers, []);
});

// Extends "[happy-8] resolveScope still approves a registry pin":
// other registry pins, each approved exactly as isRegistryVersion says.
test("[happy-8] resolveScope approves every registry pin isRegistryVersion accepts", () => {
  for (const version of ["3.22.4", ">=1.0.0 <2.0.0", "1.x || 2.x", "latest", "*", "1.0.0-beta.1+build.5"]) {
    assert.equal(isRegistryVersion(version), true, version);
    const scope = pinnedTo("zod", version);
    const zod = scope.dependencies.find((item) => item.name === "zod");
    assert.equal(zod?.resolution, "approved-package", version);
    assert.equal(zod?.version, version);
    assert.deepEqual(scope.blockers, [], version);
  }
});

// Extends "[happy-8] resolveScope approves a blank pin, which isRegistryVersion accepts":
// padded pins and an explicit approval.
test("[happy-8] resolveScope approves a padded registry pin, chosen or by default", () => {
  for (const version of ["  1.2.3  ", " ^3.22.0"]) {
    assert.equal(isRegistryVersion(version), true, JSON.stringify(version));
    for (const choices of [undefined, { zod: "approved-package" as const }]) {
      const scope = pinnedTo("zod", version, choices);
      assert.equal(
        scope.dependencies.find((item) => item.name === "zod")?.resolution,
        "approved-package",
      );
      assert.deepEqual(scope.blockers, []);
    }
  }
});
