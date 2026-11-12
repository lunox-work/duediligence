import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isRegistryVersion,
  resolveScope,
} from "../src/sandbox/provenance.js";
import type { DependencyChoice } from "../src/sandbox/provenance.js";
import { OPERATION_POLICY } from "../src/slice/manifest.js";
import type { BoundaryContract, SliceManifest } from "../src/slice/manifest.js";

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

/** A scope whose only requirement is "zod" at `version`, from the public registry. */
const zodPinnedTo = (
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
            name: "zod",
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

test("[happy-7] semver versions, ranges and dist-tags are registry versions", () => {
  for (const version of [
    "3.22.4",
    "^1.2.0",
    "~1.2",
    ">=1.0.0 <2.0.0",
    "1.x || 2.x",
    "*",
    "latest",
    "1.0.0-beta.1+build.5",
  ])
    assert.equal(isRegistryVersion(version), true, version);
});

test("[happy-7] a version made of every allowed character, and each allowed character alone, is a registry version", () => {
  const allowed =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-+^~<>=|* ";
  assert.equal(isRegistryVersion(allowed), true);
  for (const character of allowed)
    assert.equal(isRegistryVersion(character), true, JSON.stringify(character));
});

test("[unhappy-1] protocols, paths, aliases and shorthands are not registry versions", () => {
  for (const version of [
    "workspace:*",
    "npm:zod@3.22.4",
    "file:../shared",
    "link:../shared",
    "git+https://github.com/a/b.git",
    "github:acme/widgets",
    "acme/widgets",
    "https://example.com/pkg.tgz",
    "1.0.0_beta",
  ])
    assert.equal(isRegistryVersion(version), false, version);
});

test("[unhappy-1] one character outside the allowed set makes an otherwise valid version false, never an exception", () => {
  for (const character of [
    ":",
    "/",
    "@",
    "_",
    "#",
    ",",
    "\\",
    " ",
    "１",
    "é",
    "\u{1F600}",
    "\0",
  ]) {
    const version = `1.2.3${character}`;
    assert.doesNotThrow(() => isRegistryVersion(version), JSON.stringify(version));
    assert.equal(isRegistryVersion(version), false, JSON.stringify(version));
    assert.equal(
      isRegistryVersion(`${character}1.2.3`),
      false,
      JSON.stringify(character),
    );
  }
});

test("[boundary-11] empty and whitespace edge cases", () => {
  assert.equal(isRegistryVersion(""), false);
  assert.equal(isRegistryVersion(" "), true);
  assert.equal(isRegistryVersion("1.2.3\n"), false);
  assert.equal(isRegistryVersion("\t1.2.3"), false);
});

test("[boundary-11] spaces are kept, not trimmed, and other whitespace is refused", () => {
  assert.equal(isRegistryVersion("  1.2.3  "), true);
  assert.equal(isRegistryVersion("   "), true);
  for (const version of ["\n", "\t", "\r", "1.2.3\r\n", "1.2.3 ", " "])
    assert.equal(isRegistryVersion(version), false, JSON.stringify(version));
});

test("[unhappy-2] resolveScope still refuses to install a pin that is not a registry version", () => {
  const scope = zodPinnedTo("npm:zod@3.22.4", { zod: "approved-package" });
  const zod = scope.dependencies.find((item) => item.name === "zod");
  assert.equal(zod?.resolution, "unresolved");
  assert.equal(
    zod?.detail,
    "Not a registry version: a URL, a path or an alias.",
  );
  assert.ok(
    scope.blockers.some(
      (blocker) =>
        blocker.code === "dependency_unresolved" &&
        blocker.detail ===
          "zod is pinned to npm:zod@3.22.4, which is not a registry version.",
    ),
    JSON.stringify(scope.blockers),
  );
});

test("[unhappy-2] resolveScope refuses an empty pin, which isRegistryVersion rejects", () => {
  const scope = zodPinnedTo("", { zod: "approved-package" });
  const zod = scope.dependencies.find((item) => item.name === "zod");
  assert.equal(zod?.resolution, "unresolved");
  assert.equal(
    zod?.detail,
    "Not a registry version: a URL, a path or an alias.",
  );
  assert.ok(
    scope.blockers.some(
      (blocker) =>
        blocker.code === "dependency_unresolved" &&
        blocker.detail === "zod is pinned to , which is not a registry version.",
    ),
    JSON.stringify(scope.blockers),
  );
});

test("[happy-8] resolveScope still approves a registry pin", () => {
  const scope = zodPinnedTo("^3.22.0");
  assert.equal(
    scope.dependencies.find((item) => item.name === "zod")?.resolution,
    "approved-package",
  );
  assert.deepEqual(scope.blockers, []);
});

test("[happy-8] resolveScope approves a blank pin, which isRegistryVersion accepts", () => {
  const scope = zodPinnedTo(" ");
  assert.equal(isRegistryVersion(" "), true);
  assert.equal(
    scope.dependencies.find((item) => item.name === "zod")?.resolution,
    "approved-package",
  );
  assert.deepEqual(scope.blockers, []);
});
