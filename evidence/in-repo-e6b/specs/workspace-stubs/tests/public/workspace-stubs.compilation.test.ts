import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OPERATION_POLICY,
  boundarySummary,
  renderBoundaryMarkdown,
  renderPublicSurfaceMarkdown,
  sliceReadiness,
} from "../src/slice/manifest.js";
import type {
  BoundaryContract,
  CompilationResult,
  SliceManifest,
} from "../src/slice/manifest.js";

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
  toolVersion: "slice@4",
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
  ],
  typedPackages: [{ name: "zod", version: "3.22.4" }],
} as const satisfies Partial<CompilationResult>;

test("[happy-9] a slice@3 compilation result is still a CompilationResult, without the new fields", () => {
  const result: CompilationResult = {
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: ["pg"],
  };
  assert.equal(result.untypedPackageErrors, undefined);
  assert.equal(result.typedPackages, undefined);
  assert.deepEqual(Object.keys(result).sort(), [
    "attempted",
    "diagnostics",
    "ok",
    "shimmedPackages",
  ]);
});

test("[happy-9] a slice@3 result parsed from JSON reads its new fields as absent", () => {
  const result: CompilationResult = JSON.parse(
    '{"attempted":false,"ok":false,"diagnostics":[],"shimmedPackages":[]}',
  ) as CompilationResult;
  assert.equal(result.untypedPackageErrors, undefined);
  assert.equal(result.typedPackages, undefined);
  assert.deepEqual(result.untypedPackageErrors ?? [], []);
  assert.deepEqual(result.typedPackages ?? [], []);
});

test("[happy-10] a slice@4 result carries typed packages and untyped-package errors", () => {
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
  assert.equal(result.untypedPackageErrors?.[0]?.line, 4);
});

test("[happy-10] the new fields take empty lists and null locations, and a typed package needs both name and version", () => {
  const empty: CompilationResult = {
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: [],
    untypedPackageErrors: [],
    typedPackages: [],
  };
  const unlocated: CompilationResult = {
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: [],
    untypedPackageErrors: [
      { file: null, line: null, code: "TS2347", message: "Untyped." },
    ],
  };
  const missingVersion: CompilationResult = {
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: [],
    // @ts-expect-error A typed package names the version its types were read at.
    typedPackages: [{ name: "zod" }],
  };
  assert.deepEqual(empty.typedPackages, []);
  assert.deepEqual(empty.untypedPackageErrors, []);
  assert.equal(unlocated.untypedPackageErrors?.[0]?.file, null);
  assert.equal(unlocated.typedPackages, undefined);
  assert.equal(missingVersion.typedPackages?.length, 1);
});

test("[boundary-12] the boundary markdown renders the same with or without the new fields", () => {
  const before = contractWith({
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: ["pg"],
  });
  const after = contractWith({
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: ["pg"],
    ...SLICE4_FIELDS,
  });
  const plain = renderBoundaryMarkdown(before, manifest);
  const widened = renderBoundaryMarkdown(after, manifest);
  assert.equal(widened, plain);
  for (const text of [plain, widened])
    assert.ok(
      text.includes(
        "The included files and stubs type-check together, with `pg` declared as untyped packages.",
      ),
    );
});

test("[boundary-12] with no shimmed packages the views neither change nor name a typed package or untyped-package error", () => {
  const before = contractWith({
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: [],
  });
  const after = contractWith({
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: [],
    ...SLICE4_FIELDS,
  });
  const widened = renderBoundaryMarkdown(after, manifest);
  assert.equal(widened, renderBoundaryMarkdown(before, manifest));
  assert.ok(
    widened.includes("The included files and stubs type-check together."),
  );
  assert.equal(widened.includes("3.22.4"), false);
  assert.equal(widened.includes("TS2347"), false);
  assert.equal(
    renderPublicSurfaceMarkdown(after),
    renderPublicSurfaceMarkdown(before),
  );
  assert.deepEqual(
    boundarySummary(after, manifest),
    boundarySummary(before, manifest),
  );
  assert.deepEqual(sliceReadiness(after), sliceReadiness(before));
});

test("[boundary-13] untyped-package errors do not appear in a failed compilation's list", () => {
  const contract = contractWith({
    attempted: true,
    ok: false,
    diagnostics: [
      { file: "src/a.ts", line: 3, code: "TS2322", message: "Bad." },
    ],
    shimmedPackages: [],
    untypedPackageErrors: [
      { file: "src/b.ts", line: 9, code: "TS2347", message: "Untyped." },
    ],
  });
  const text = renderBoundaryMarkdown(contract, manifest);
  const compilation = text.slice(text.indexOf("## Compilation"));
  assert.ok(text.includes("## Compilation"));
  assert.ok(compilation.includes("- `src/a.ts`:3 TS2322: Bad."));
  assert.equal(text.includes("TS2347"), false);
});

test("[boundary-13] a failed compilation renders the same list whether or not it carries untyped-package errors and typed packages", () => {
  const base: CompilationResult = {
    attempted: true,
    ok: false,
    diagnostics: [
      { file: "src/a.ts", line: 3, code: "TS2322", message: "Bad." },
      { file: null, line: null, code: "TS1000", message: "Global." },
    ],
    shimmedPackages: [],
  };
  const plain = renderBoundaryMarkdown(contractWith(base), manifest);
  const widened = renderBoundaryMarkdown(
    contractWith({
      ...base,
      untypedPackageErrors: [
        { file: "src/b.ts", line: 9, code: "TS2347", message: "Untyped." },
        { file: null, line: null, code: "TS7016", message: "No types." },
      ],
      typedPackages: [{ name: "zod", version: "3.22.4" }],
    }),
    manifest,
  );
  assert.equal(widened, plain);
  assert.equal(widened.includes("src/b.ts"), false);
  assert.equal(widened.includes("TS7016"), false);
});
