import assert from "node:assert/strict";
import { test } from "node:test";
import { renderBoundaryMarkdown } from "../src/slice/manifest.js";
import type {
  BoundaryContract,
  CompilationResult,
  SliceManifest,
} from "../src/slice/manifest.js";

const manifest: Pick<
  SliceManifest,
  "included" | "entryPoints" | "budget" | "externals" | "meta"
> = {
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
  externals: { packages: [], environment: [] },
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

const contractWith = (compilation: CompilationResult): BoundaryContract => ({
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
  compilation,
  blockers: [],
});

const render = (compilation: CompilationResult) =>
  renderBoundaryMarkdown(contractWith(compilation), manifest);

const okWithPg: CompilationResult = {
  attempted: true,
  ok: true,
  diagnostics: [],
  shimmedPackages: ["pg"],
};

const UNCOUNTED_TAIL =
  "the source has too, with its packages untyped, is not counted; the sandbox build checks them against the packages it installs.";

test("[happy-11] a slice@3 compilation result is still a CompilationResult", () => {
  const result: CompilationResult = {
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: ["pg"],
  };
  assert.equal(result.untypedPackageErrors, undefined);
  assert.equal(result.typedPackages, undefined);
});

test("[happy-11] a slice@3 result with failing diagnostics still type-checks without the new fields", () => {
  const result: CompilationResult = {
    attempted: true,
    ok: false,
    diagnostics: [{ file: null, line: null, code: "TS1", message: "x" }],
    shimmedPackages: [],
  };
  assert.equal(result.untypedPackageErrors, undefined);
  assert.equal(result.typedPackages, undefined);
  assert.equal(render(result).endsWith("## Compilation\n\n- TS1: x\n"), true);
});

test("[happy-12] a slice@4 result carries typed packages and untyped-package errors", () => {
  const result: CompilationResult = {
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: ["@acme/shared"],
    untypedPackageErrors: [
      {
        file: "src/app.ts",
        line: 4,
        code: "TS2347",
        message: "Untyped function calls may not accept type arguments.",
      },
    ],
    typedPackages: [{ name: "zod", version: "3.22.4" }],
  };
  assert.deepEqual(result.typedPackages, [{ name: "zod", version: "3.22.4" }]);
  assert.equal(result.untypedPackageErrors?.[0]?.code, "TS2347");
});

test("[happy-12] untyped-package errors take diagnostics' shape, null file and line included; a typed package needs a version", () => {
  const result: CompilationResult = {
    attempted: false,
    ok: false,
    diagnostics: [],
    shimmedPackages: [],
    untypedPackageErrors: [{ file: null, line: null, code: "TS1", message: "x" }],
    typedPackages: [],
  };
  assert.deepEqual(result.typedPackages, []);
  const missingVersion: CompilationResult = {
    ...result,
    // @ts-expect-error a typed package names the version whose types were read
    typedPackages: [{ name: "zod" }],
  };
  assert.ok(missingVersion);
});

test("[happy-13] the boundary markdown names the typed packages and counts the uncounted errors", () => {
  const result = render({
    ...okWithPg,
    typedPackages: [
      { name: "zod", version: "3.22.4" },
      { name: "@types/x", version: "1.0.0" },
    ],
    untypedPackageErrors: [
      { file: "src/b.ts", line: 9, code: "TS2347", message: "Untyped." },
    ],
  });
  assert.ok(
    result.endsWith(
      [
        "## Compilation",
        "",
        "The included files and stubs type-check together, with `pg` declared as untyped packages.",
        "",
        "Checked against the published types of `zod@3.22.4`, `@types/x@1.0.0`.",
        "",
        `1 more error ${UNCOUNTED_TAIL}`,
        "",
      ].join("\n"),
    ),
    result,
  );
  assert.equal(result.includes("TS2347"), false);
});

test("[happy-13] typed packages alone add only their line after a blank line", () => {
  const result = render({
    ...okWithPg,
    typedPackages: [{ name: "zod", version: "3.22.4" }],
  });
  assert.ok(
    result.endsWith(
      "## Compilation\n\nThe included files and stubs type-check together, with `pg` declared as untyped packages.\n\nChecked against the published types of `zod@3.22.4`.\n",
    ),
    result,
  );
  assert.equal(result.includes("not counted"), false);
});

test("[boundary-12] untyped-package errors are counted, not listed, after a failed compilation's list", () => {
  const result = render({
    attempted: true,
    ok: false,
    diagnostics: [{ file: "src/a.ts", line: 3, code: "TS2322", message: "Bad." }],
    shimmedPackages: [],
    untypedPackageErrors: [
      { file: "src/b.ts", line: 9, code: "TS2347", message: "Untyped." },
      { file: null, line: null, code: "TS1", message: "x" },
    ],
  });
  assert.ok(
    result.endsWith(
      `## Compilation\n\n- \`src/a.ts\`:3 TS2322: Bad.\n\n2 more errors ${UNCOUNTED_TAIL.replace("is not counted", "are not counted")}\n`,
    ),
    result,
  );
  assert.equal(result.includes("TS2347"), false);
});

test("[boundary-12] a single untyped-package error after a failed compilation is counted in the singular", () => {
  const result = render({
    attempted: true,
    ok: false,
    diagnostics: [{ file: "src/a.ts", line: 3, code: "TS2322", message: "Bad." }],
    shimmedPackages: [],
    untypedPackageErrors: [
      { file: "src/b.ts", line: 9, code: "TS2347", message: "Untyped." },
    ],
  });
  assert.ok(
    result.endsWith(
      `## Compilation\n\n- \`src/a.ts\`:3 TS2322: Bad.\n\n1 more error ${UNCOUNTED_TAIL}\n`,
    ),
    result,
  );
  assert.equal(result.includes("Untyped."), false);
});

test("[boundary-13] absent or empty new fields render as before", () => {
  const absent = render(okWithPg);
  const empty = render({ ...okWithPg, typedPackages: [], untypedPackageErrors: [] });
  assert.equal(absent, empty);
  for (const result of [absent, empty]) {
    assert.equal(result.includes("Checked against the published types"), false);
    assert.equal(result.includes("not counted"), false);
  }
});

test("[boundary-13] an empty typedPackages alone leaves the Compilation section as it was", () => {
  const result = render({ ...okWithPg, typedPackages: [] });
  assert.equal(result, render(okWithPg));
  assert.ok(
    result.endsWith(
      "## Compilation\n\nThe included files and stubs type-check together, with `pg` declared as untyped packages.\n",
    ),
    result,
  );
});

test("[boundary-14] typed packages are named even when no compilation was attempted", () => {
  const result = render({
    attempted: false,
    ok: false,
    diagnostics: [],
    shimmedPackages: [],
    typedPackages: [{ name: "zod", version: "3.22.4" }],
  });
  assert.ok(
    result.endsWith(
      "## Compilation\n\nNo compilation was attempted for this language.\n\nChecked against the published types of `zod@3.22.4`.\n",
    ),
    result,
  );
});

test("[boundary-14] uncounted errors are counted even when no compilation was attempted", () => {
  const result = render({
    attempted: false,
    ok: false,
    diagnostics: [],
    shimmedPackages: [],
    untypedPackageErrors: [{ file: null, line: null, code: "TS1", message: "x" }],
  });
  assert.ok(
    result.endsWith(
      `## Compilation\n\nNo compilation was attempted for this language.\n\n1 more error ${UNCOUNTED_TAIL}\n`,
    ),
    result,
  );
});
