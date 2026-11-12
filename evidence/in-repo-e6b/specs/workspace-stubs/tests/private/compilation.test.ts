import assert from "node:assert/strict";
import { test } from "node:test";
import { SLICE_TOOL_VERSION } from "../../src/analysis.js";
import {
  OPERATION_POLICY,
  boundarySummary,
  renderBoundaryMarkdown,
  renderPublicSurfaceMarkdown,
  sliceReadiness,
} from "../../src/slice/manifest.js";
import type {
  BoundaryContract,
  CompilationResult,
  SliceManifest,
} from "../../src/slice/manifest.js";

// The contracts here are the slice@4 tool's own: the version whose results carry
// typedPackages and untypedPackageErrors.
const manifest: SliceManifest = {
  schemaVersion: 1,
  toolVersion: SLICE_TOOL_VERSION,
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
  externals: {
    packages: [{ specifier: "pg", service: "postgres", files: ["src/app.ts"] }],
    environment: [],
  },
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
    externals: 1,
    blockers: 0,
    ready: true,
  },
};

const contractWith = (compilation: CompilationResult): BoundaryContract => ({
  schemaVersion: 1,
  toolVersion: SLICE_TOOL_VERSION,
  extractorVersion: "typescript@5.9.3",
  sourceSnapshotId: "rsn_1",
  sourceCommitSha: "a".repeat(40),
  graphRunId: "arn_graph",
  language: "typescript",
  outbound: [],
  inbound: [
    {
      module: "src/app.ts",
      symbols: [
        {
          name: "run",
          kind: "function",
          declaration: "export declare function run(): void;",
        },
      ],
      importedBy: ["consumers/cli.ts"],
      stubPath: null,
    },
  ],
  stubCoverage: "full",
  compilation,
  blockers: [],
});

const SLICE4_FIELDS = {
  untypedPackageErrors: [
    {
      file: "src/app.ts",
      line: 4,
      code: "TS2347",
      message: "Untyped function calls may not accept type arguments.",
    },
    { file: "src/db.ts", line: 12, code: "TS7031", message: "Untyped binding element." },
    { file: null, line: null, code: "TS7016", message: "Could not find a declaration file." },
  ],
  typedPackages: [
    { name: "zod", version: "3.22.4" },
    { name: "@acme/ui", version: "2.0.1" },
  ],
} as const satisfies Partial<CompilationResult>;

/** The views a contract renders, all of which ignore the new fields. */
const views = (contract: BoundaryContract) => ({
  boundary: renderBoundaryMarkdown(contract, manifest),
  surface: renderPublicSurfaceMarkdown(contract),
  summary: boundarySummary(contract, manifest),
  readiness: sliceReadiness(contract),
});

// Extends "[boundary-12] the boundary markdown renders the same with or without the new fields":
// several shimmed packages, several typed packages and untyped-package errors, and every view.
test("[boundary-12] a slice@4 contract with several shimmed and typed packages renders every view as without the new fields", () => {
  assert.equal(SLICE_TOOL_VERSION, "slice@4");
  const base: CompilationResult = {
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: ["@acme/shared", "pg"],
  };
  const plain = views(contractWith(base));
  const widened = views(contractWith({ ...base, ...SLICE4_FIELDS }));
  assert.deepEqual(widened, plain);
  assert.ok(
    widened.boundary.includes(
      "The included files and stubs type-check together, with `@acme/shared`, `pg` declared as untyped packages.",
    ),
  );
  for (const text of ["3.22.4", "2.0.1", "@acme/ui", "TS2347", "TS7031", "TS7016", "src/db.ts"])
    assert.equal(widened.boundary.includes(text), false, text);
});

// Extends "[boundary-12] with no shimmed packages the views neither change nor name a typed package or untyped-package error":
// a compilation that was not attempted, and one carrying only one of the two new fields.
test("[boundary-12] an unattempted slice@4 compilation, and either new field alone, render as without them", () => {
  assert.equal(SLICE_TOOL_VERSION, "slice@4");
  const base: CompilationResult = {
    attempted: false,
    ok: false,
    diagnostics: [],
    shimmedPackages: [],
  };
  const plain = views(contractWith(base));
  for (const extra of [
    SLICE4_FIELDS,
    { typedPackages: SLICE4_FIELDS.typedPackages },
    { untypedPackageErrors: SLICE4_FIELDS.untypedPackageErrors },
  ]) {
    const widened = views(contractWith({ ...base, ...extra }));
    assert.deepEqual(widened, plain);
    assert.ok(widened.boundary.includes("No compilation was attempted for this language."));
  }
});

// Extends "[boundary-13] untyped-package errors do not appear in a failed compilation's list":
// several diagnostics and several untyped-package errors; the list is exactly the diagnostics, in order.
test("[boundary-13] a failed slice@4 compilation lists exactly its diagnostics, in order, and no untyped-package error", () => {
  assert.equal(SLICE_TOOL_VERSION, "slice@4");
  const contract = contractWith({
    attempted: true,
    ok: false,
    diagnostics: [
      { file: "src/z.ts", line: 30, code: "TS2322", message: "Bad." },
      { file: "src/a.ts", line: 3, code: "TS2345", message: "Worse." },
      { file: null, line: null, code: "TS1000", message: "Global." },
    ],
    shimmedPackages: ["@acme/shared"],
    ...SLICE4_FIELDS,
  });
  const text = renderBoundaryMarkdown(contract, manifest);
  const compilation = text.slice(text.indexOf("## Compilation"));
  const listed = compilation.split("\n").filter((line) => line.startsWith("- "));
  assert.deepEqual(listed, [
    "- `src/z.ts`:30 TS2322: Bad.",
    "- `src/a.ts`:3 TS2345: Worse.",
    "- TS1000: Global.",
  ]);
  for (const hidden of ["TS2347", "TS7031", "TS7016", "src/db.ts", "Untyped binding element."])
    assert.equal(text.includes(hidden), false, hidden);
});

// Extends "[boundary-13] a failed compilation renders the same list whether or not it carries untyped-package errors and typed packages":
// a failed compilation whose only errors are untyped-package ones lists nothing.
test("[boundary-13] a failed slice@4 compilation with no diagnostics lists none of its untyped-package errors", () => {
  assert.equal(SLICE_TOOL_VERSION, "slice@4");
  const base: CompilationResult = {
    attempted: true,
    ok: false,
    diagnostics: [],
    shimmedPackages: [],
  };
  const plain = renderBoundaryMarkdown(contractWith(base), manifest);
  const widened = renderBoundaryMarkdown(
    contractWith({ ...base, ...SLICE4_FIELDS }),
    manifest,
  );
  assert.equal(widened, plain);
  const compilation = widened.slice(widened.indexOf("## Compilation"));
  assert.equal(
    compilation.split("\n").some((line) => line.startsWith("- ")),
    false,
  );
  assert.equal(widened.includes("TS2347"), false);
});
