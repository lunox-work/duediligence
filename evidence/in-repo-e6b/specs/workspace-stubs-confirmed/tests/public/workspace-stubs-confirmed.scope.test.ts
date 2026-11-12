import assert from "node:assert/strict";
import { test } from "node:test";
import { isRegistryVersion, resolveScope } from "../src/sandbox/provenance.js";
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

/** A required public-registry package "zod", not a workspace package, pinned to `version`. */
const zodPinnedTo = (
  version: string,
  choices?: Readonly<Record<string, DependencyChoice>>,
) =>
  resolveScope({
    manifest: {
      ...manifest,
      requiredBuildInputs: {
        configs: ["package.json"],
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

const zodOf = (scope: ReturnType<typeof resolveScope>) =>
  scope.dependencies.find((dependency) => dependency.name === "zod");

test("[happy-8] semver versions, ranges, dist-tags and registry aliases are registry versions", () => {
  for (const version of [
    "3.22.4",
    "^1.2.0",
    "~1.2",
    ">=1.0.0 <2.0.0",
    "1.x || 2.x",
    "*",
    "latest",
    "1.0.0-beta.1+build.5",
    "npm:zod@3.22.4",
    "npm:@acme/x@^1.0.0",
    "npm:zod@latest",
  ])
    assert.equal(isRegistryVersion(version), true, version);
});

test("[happy-8] every allowed character, alone or together, makes a registry version", () => {
  const allowed =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.-+^~<>=|* ";
  assert.equal(isRegistryVersion(allowed), true);
  for (const character of allowed)
    assert.equal(isRegistryVersion(character), true, JSON.stringify(character));
  assert.equal(isRegistryVersion(`npm:@acme/x@${allowed}`), true);
});

test("[unhappy-1] protocols, paths, other aliases and shorthands are not registry versions", () => {
  for (const version of [
    "workspace:*",
    "file:../shared",
    "link:../shared",
    "git+https://github.com/a/b.git",
    "github:acme/widgets",
    "acme/widgets",
    "https://example.com/pkg.tgz",
    "1.0.0_beta",
    "npm:zod",
    "npm:zod@",
    "npm:Zod@1.0.0",
    "npm:zod@file:../x",
    "npm:zod@github:a/b",
    "npm:zod@1@2",
  ])
    assert.equal(isRegistryVersion(version), false, version);
});

test("[unhappy-1] a single character outside the allowed set makes it not a registry version", () => {
  for (const version of ["1.0.0/", "1.0.0:", "1.0.0#x", "1.0.0@", "1.0.0é", "npm:@Acme/x@1.0.0"])
    assert.equal(isRegistryVersion(version), false, version);
});

test("[boundary-11] empty and whitespace edge cases", () => {
  assert.equal(isRegistryVersion(""), false);
  assert.equal(isRegistryVersion(" "), true);
  assert.equal(isRegistryVersion("npm:zod@ "), true);
  assert.equal(isRegistryVersion("1.2.3\n"), false);
  assert.equal(isRegistryVersion("\t1.2.3"), false);
});

test("[happy-9] resolveScope installs a pin that aliases a registry version", () => {
  const scope = zodPinnedTo("npm:zod@3.22.4", { zod: "approved-package" });
  assert.deepEqual(zodOf(scope), {
    name: "zod",
    kind: "package",
    version: "npm:zod@3.22.4",
    resolution: "approved-package",
    detail: "Installed at the version package.json pins.",
  });
  assert.deepEqual(scope.blockers, []);
});

test("[happy-9] resolveScope installs a scoped alias to a dist-tag", () => {
  const scope = zodPinnedTo("npm:@acme/zod-fork@latest", {
    zod: "approved-package",
  });
  assert.equal(zodOf(scope)?.resolution, "approved-package");
  assert.equal(zodOf(scope)?.version, "npm:@acme/zod-fork@latest");
  assert.deepEqual(scope.blockers, []);
});

test("[unhappy-2] resolveScope still refuses to install a pin that is not a registry version", () => {
  const scope = zodPinnedTo("file:../zod", { zod: "approved-package" });
  assert.equal(zodOf(scope)?.resolution, "unresolved");
  assert.equal(zodOf(scope)?.detail, "Not a registry version: a URL or a path.");
  assert.ok(
    scope.blockers.some(
      (blocker) =>
        blocker.code === "dependency_unresolved" &&
        blocker.detail ===
          "zod is pinned to file:../zod, which is not a registry version.",
    ),
    JSON.stringify(scope.blockers),
  );
});

test("[unhappy-2] resolveScope refuses an alias whose target name is not lowercase", () => {
  const scope = zodPinnedTo("npm:Zod@1.0.0", { zod: "approved-package" });
  assert.equal(zodOf(scope)?.resolution, "unresolved");
  assert.equal(zodOf(scope)?.detail, "Not a registry version: a URL or a path.");
  assert.ok(
    scope.blockers.some(
      (blocker) =>
        blocker.code === "dependency_unresolved" &&
        blocker.detail ===
          "zod is pinned to npm:Zod@1.0.0, which is not a registry version.",
    ),
    JSON.stringify(scope.blockers),
  );
});

test("[happy-10] resolveScope still approves a registry pin", () => {
  const scope = zodPinnedTo("^3.22.0");
  assert.equal(zodOf(scope)?.resolution, "approved-package");
  assert.deepEqual(scope.blockers, []);
});

test("[happy-10] resolveScope approves a compound registry range pin by default", () => {
  const scope = zodPinnedTo(">=1.0.0 <2.0.0 || 3.x");
  assert.equal(zodOf(scope)?.resolution, "approved-package");
  assert.equal(zodOf(scope)?.detail, "Installed at the version package.json pins.");
  assert.deepEqual(scope.blockers, []);
});
