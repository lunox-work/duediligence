import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AMBIENT_PATH,
  NODE_GLOBAL_DECLARATIONS,
  ambientDeclarations,
  generateProject,
} from "../../src/sandbox/project.js";
import type { PackageModules, ProjectInput } from "../../src/sandbox/project.js";
import type { ResolvedDependency } from "../../src/sandbox/provenance.js";
import { OPERATION_POLICY } from "../../src/slice/manifest.js";
import type {
  BoundaryContract,
  CompilationResult,
  SliceManifest,
} from "../../src/slice/manifest.js";

const H_UNTYPED = [
  "// The same declarations the slice was type-checked against: Node's",
  "// modules and globals untyped, and every package untyped. The project",
  "// installs its approved packages for real; their own types are not",
  "// consulted, so a contribution is checked against the slice's contract.",
];
const H_TYPED = [
  "// The same declarations the slice was type-checked against: Node's",
  "// modules and globals untyped, and every package untyped but those the",
  "// project installs and the slice was checked against: they keep their",
  "// own published types.",
];
const NODE = ['declare module "node:*";', ...NODE_GLOBAL_DECLARATIONS];

const expected = (lines: readonly string[], text = "") =>
  `${lines.join("\n")}\n${text}`;

const packageLines = (name: string) => [
  `declare module "${name}";`,
  `declare module "${name}/*";`,
];

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

const SLICE3: CompilationResult = {
  attempted: true,
  ok: true,
  diagnostics: [],
  shimmedPackages: ["pg"],
};

const contractOf = (compilation: CompilationResult): BoundaryContract => ({
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

/** The slice@3 compilation, with `typedPackages` set unless "absent". */
const compilationWith = (
  typedPackages: CompilationResult["typedPackages"] | "absent",
): CompilationResult =>
  typedPackages === "absent" ? SLICE3 : { ...SLICE3, typedPackages };

const dependency = (
  name: string,
  version: string | null,
  resolution: ResolvedDependency["resolution"],
): ResolvedDependency => ({
  name,
  kind: "package",
  version,
  resolution,
  detail: "Fixture.",
});

const DEPENDENCIES: readonly ResolvedDependency[] = [
  dependency("zod", "^3.22.0", "approved-package"),
  dependency("lodash", "4.17.21", "approved-package"),
  dependency("pg", "^8.11.0", "runtime-mock"),
];

function build(
  compilation: CompilationResult,
  overrides: Partial<ProjectInput> = {},
) {
  return generateProject({
    version: {
      sandboxId: "sbx_1",
      versionId: "sbv_1",
      version: 1,
      title: "Fix the widget",
      specSummary: "Make it work.",
      complexity: "M",
      tags: ["typescript"],
    },
    manifest,
    contract: contractOf(compilation),
    sources: [
      {
        originalPath: "src/app.ts",
        path: "src/app.ts",
        text: 'import { z } from "zod";\nimport pg from "pg";\nexport function run() { return [z, pg]; }\n',
      },
    ],
    stubs: [],
    spec: null,
    dependencies: DEPENDENCIES,
    acceptanceTests: [],
    knownSpecifiers: ["fs", "path"],
    ...overrides,
  });
}

const project = (
  typedPackages: CompilationResult["typedPackages"] | "absent",
  overrides: Partial<ProjectInput> = {},
) => build(compilationWith(typedPackages), overrides);

const ambientOf = (result: ReturnType<typeof generateProject>) => {
  const file = result.files.find((item) => item.path === AMBIENT_PATH);
  assert.ok(file, `no file at ${AMBIENT_PATH}`);
  return file.text;
};

const linesOf = (text: string) => text.split("\n");

const dependenciesOf = (result: ReturnType<typeof generateProject>) => {
  const file = result.files.find((item) => item.path === "package.json");
  assert.ok(file, "no package.json");
  return (JSON.parse(file.text) as { dependencies: Record<string, string> })
    .dependencies;
};

/** Everything but the ambient file's text, which is all typedPackages may change. */
const restOf = (result: ReturnType<typeof generateProject>) => ({
  files: result.files.map((file) =>
    file.path === AMBIENT_PATH ? { ...file, text: "" } : file,
  ),
  blockers: result.blockers,
  importRewrites: result.importRewrites,
  descriptor: result.descriptor,
  publicTests: result.publicTests,
});

const WIDE: readonly ResolvedDependency[] = [
  dependency("zod", "^3.22.0", "approved-package"),
  dependency("@acme/ui", "1.0.0", "approved-package"),
  dependency("lodash", "4.17.21", "approved-package"),
  dependency("pg", "^8.11.0", "runtime-mock"),
  dependency("stripe", "*", "runtime-mock"),
];

// Extends "[happy-6] a typed approved package loses its shorthand and wildcard; an untyped one keeps them":
// two typed approved packages, one scoped, beside an untyped approved one, two mocks and an
// entry for a package the project does not have.
test("[happy-6] several typed approved packages lose both lines; the rest keep theirs", () => {
  const result = project(
    [
      { name: "react", version: "18.3.1" },
      { name: "@acme/ui", version: "1.0.3" },
      { name: "zod", version: "3.22.4" },
    ],
    { dependencies: WIDE },
  );
  assert.equal(
    ambientOf(result),
    expected([
      ...H_TYPED,
      ...NODE,
      ...packageLines("fs"),
      ...packageLines("lodash"),
      ...packageLines("path"),
      ...packageLines("pg"),
      ...packageLines("stripe"),
    ]),
  );
  assert.deepEqual(dependenciesOf(result), {
    "@acme/ui": "1.0.0",
    lodash: "4.17.21",
    pg: "file:mocks/pg",
    stripe: "file:mocks/stripe",
    zod: "^3.22.0",
  });
  assert.deepEqual(restOf(result), restOf(project("absent", { dependencies: WIDE })));
});

// Extends "[happy-6] the ambient file is ambientDeclarations of the same packages with the typed approved package installed, and nothing else changes":
// typedPackages naming a mocked package and Node's bare modules too: only the approved one counts.
test("[happy-6] typedPackages naming mocks and Node's bare modules installs only the approved package", () => {
  const result = project([
    { name: "fs", version: "0.0.0" },
    { name: "path", version: "0.0.0" },
    { name: "pg", version: "8.11.3" },
    { name: "zod", version: "3.22.4" },
  ]);
  assert.equal(
    ambientOf(result),
    ambientDeclarations(["lodash", "pg", "zod", "fs", "path"], undefined, new Set(["zod"])),
  );
  const lines = linesOf(ambientOf(result));
  for (const name of ["fs", "path", "pg", "lodash"])
    assert.ok(lines.includes(`declare module "${name}/*";`), name);
  assert.equal(lines.includes('declare module "zod/*";'), false);
});

// Extends "[happy-6]": with packageModules given, the typed package's modules text stays and the
// file is ambientDeclarations of the same packages, modules and installed set; nothing else changes.
test("[happy-6] with packageModules, the typed approved package's lines go and the modules text stays", () => {
  const packageModules: PackageModules = {
    specifiers: ["zod", "lodash"],
    text: 'declare module "zod" {\n  export const z: any;\n}\ndeclare module "lodash" {\n  export const chunk: any;\n}\n',
  };
  const typed = project([{ name: "zod", version: "3.22.4" }], { packageModules });
  assert.equal(
    ambientOf(typed),
    expected(
      [
        ...H_TYPED,
        ...NODE,
        ...packageLines("fs"),
        'declare module "lodash/*";',
        ...packageLines("path"),
        ...packageLines("pg"),
      ],
      packageModules.text,
    ),
  );
  assert.deepEqual(restOf(typed), restOf(project("absent", { packageModules })));
});

// Extends "[happy-6]": a known specifier whose bare name is the typed approved package is skipped too.
test("[happy-6] a typed approved package also named by a known subpath specifier gets no line at all", () => {
  const text = ambientOf(
    project([{ name: "zod", version: "3.22.4" }], {
      knownSpecifiers: ["zod/v4", "fs/promises", "node:fs", "events"],
    }),
  );
  assert.equal(
    text,
    ambientDeclarations(
      ["lodash", "pg", "zod", "zod", "fs", "events"],
      undefined,
      new Set(["zod"]),
    ),
  );
  assert.equal(
    linesOf(text).some((line) => line.includes('"zod')),
    false,
  );
});

// Extends "[boundary-8] a contract without typedPackages builds the ambient file as before":
// other dependencies and known specifiers; the same dependencies with a typed package do differ.
test("[boundary-8] without typedPackages, other dependencies and specifiers build the untyped file as before", () => {
  const overrides: Partial<ProjectInput> = {
    dependencies: WIDE,
    knownSpecifiers: ["fs/promises", "node:path", "@acme/ui/button", "events"],
    packageModules: { specifiers: ["@acme/ui"], text: 'declare module "@acme/ui" {}\n' },
  };
  const text = ambientOf(project("absent", overrides));
  assert.equal(
    text,
    ambientDeclarations(
      ["@acme/ui", "lodash", "zod", "pg", "stripe", "fs", "@acme/ui", "events"],
      overrides.packageModules,
    ),
  );
  assert.deepEqual(linesOf(text).slice(0, 4), H_UNTYPED);
  const typed = ambientOf(project([{ name: "@acme/ui", version: "1.0.0" }], overrides));
  assert.deepEqual(linesOf(typed).slice(0, 4), H_TYPED);
  assert.equal(linesOf(typed).includes('declare module "@acme/ui/*";'), false);
  assert.ok(linesOf(text).includes('declare module "@acme/ui/*";'));
});

// Extends "[boundary-8] without typedPackages or packageModules every approved and mocked package keeps both lines":
// a failed compilation without the field, and a slice@3 result parsed from JSON.
test("[boundary-8] a failed or parsed compilation without typedPackages keeps every package untyped", () => {
  const failed: CompilationResult = {
    attempted: true,
    ok: false,
    diagnostics: [{ file: "src/app.ts", line: 1, code: "TS2322", message: "Bad." }],
    shimmedPackages: ["zod"],
  };
  const parsed = JSON.parse(
    '{"attempted":false,"ok":false,"diagnostics":[],"shimmedPackages":[]}',
  ) as CompilationResult;
  const before = expected([
    ...H_UNTYPED,
    ...NODE,
    ...packageLines("fs"),
    ...packageLines("lodash"),
    ...packageLines("path"),
    ...packageLines("pg"),
    ...packageLines("zod"),
  ]);
  assert.equal(ambientOf(build(failed)), before);
  assert.equal(ambientOf(build(parsed)), before);
  assert.notEqual(
    ambientOf(build({ ...failed, typedPackages: [{ name: "zod", version: "3.22.4" }] })),
    before,
  );
});

// Extends "[boundary-9] an empty typedPackages is the same as an absent one":
// a wider project, compared whole; a non-empty list that names an approved package is not the same.
test("[boundary-9] an empty typedPackages builds the same whole project as an absent one", () => {
  const overrides = { dependencies: WIDE, knownSpecifiers: ["fs", "crypto"] };
  const empty = project([], overrides);
  const absent = project("absent", overrides);
  assert.deepEqual(empty, absent);
  assert.deepEqual(linesOf(ambientOf(empty)).slice(0, 4), H_UNTYPED);
  assert.notEqual(
    ambientOf(project([{ name: "lodash", version: "4.17.21" }], overrides)),
    ambientOf(absent),
  );
});

// Extends "[boundary-9] typedPackages naming only packages the project does not install is the same as an absent one":
// names that differ from an approved package only by case, a subpath or a scope match nothing.
test("[boundary-9] typedPackages names matching an approved package only loosely are the same as an absent list", () => {
  const overrides = {
    dependencies: [
      ...DEPENDENCIES,
      dependency("@acme/sdk", "2.0.0", "approved-package"),
    ],
  };
  const loose = ambientOf(
    project(
      [
        { name: "ZOD", version: "3.22.4" },
        { name: "zod/v4", version: "3.22.4" },
        { name: "@acme", version: "2.0.0" },
        { name: "@acme/sdk/client", version: "2.0.0" },
        { name: " lodash", version: "4.17.21" },
      ],
      overrides,
    ),
  );
  assert.equal(loose, ambientOf(project("absent", overrides)));
  assert.deepEqual(linesOf(loose).slice(0, 4), H_UNTYPED);
  const exact = ambientOf(project([{ name: "@acme/sdk", version: "2.0.0" }], overrides));
  assert.deepEqual(linesOf(exact).slice(0, 4), H_TYPED);
  assert.equal(linesOf(exact).includes('declare module "@acme/sdk/*";'), false);
});

// Extends "[boundary-10] only approved, pinned packages can count as installed":
// each row of the outline beside a typed approved package, so the header is typed and only the
// approved, pinned one loses its lines.
test("[boundary-10] beside an installed package, a mocked or unpinned typed package is not installed", () => {
  const mocked = ambientOf(
    project(
      [
        { name: "zod", version: "1.0.0" },
        { name: "stripe", version: "1.0.0" },
      ],
      {
        dependencies: [
          dependency("zod", "1.0.0", "approved-package"),
          dependency("stripe", "*", "runtime-mock"),
        ],
      },
    ),
  );
  assert.equal(
    mocked,
    expected([
      ...H_TYPED,
      ...NODE,
      ...packageLines("fs"),
      ...packageLines("path"),
      ...packageLines("stripe"),
    ]),
  );
  const unpinned = ambientOf(
    project(
      [
        { name: "zod", version: "1.0.0" },
        { name: "@acme/sdk", version: "1.0.0" },
      ],
      {
        dependencies: [
          dependency("zod", "1.0.0", "approved-package"),
          dependency("@acme/sdk", null, "approved-package"),
        ],
      },
    ),
  );
  assert.equal(
    unpinned,
    expected([...H_TYPED, ...NODE, ...packageLines("fs"), ...packageLines("path")]),
  );
});

// Extends "[boundary-10] a mocked or unpinned package named in typedPackages leaves the installed set empty, so the header stays untyped":
// a scoped approved, pinned package and an unresolved one; versions are never compared, and a
// repeated entry changes nothing.
test("[boundary-10] an approved, pinned scoped package is installed at any typed version; an unresolved one is not", () => {
  const dependencies = [
    dependency("@acme/sdk", "2.0.0", "approved-package"),
    dependency("left-pad", "1.3.0", "unresolved"),
    dependency("pg", "^8.11.0", "runtime-mock"),
  ];
  const text = ambientOf(
    project(
      [
        { name: "@acme/sdk", version: "0.0.1" },
        { name: "@acme/sdk", version: "9.0.0" },
        { name: "left-pad", version: "1.3.0" },
      ],
      { dependencies },
    ),
  );
  assert.equal(
    text,
    expected([
      ...H_TYPED,
      ...NODE,
      ...packageLines("fs"),
      ...packageLines("path"),
      ...packageLines("pg"),
    ]),
  );
  assert.equal(
    text,
    ambientDeclarations(["@acme/sdk", "pg", "fs", "path"], undefined, new Set(["@acme/sdk"])),
  );
});

// Extends "[happy-9] a slice@3 compilation result is still a CompilationResult, without the new fields":
// a slice@3 result reaches generateProject, which reads its absent typedPackages as none,
// while the same result with the slice@4 field installs the package.
test("[happy-9] a slice@3 compilation result builds a project that reads its typedPackages as none", () => {
  const result: CompilationResult = {
    attempted: true,
    ok: true,
    diagnostics: [],
    shimmedPackages: ["pg"],
  };
  assert.equal(result.typedPackages, undefined);
  assert.equal(result.untypedPackageErrors, undefined);
  assert.equal("typedPackages" in result, false);
  const text = ambientOf(build(result));
  assert.deepEqual(linesOf(text).slice(0, 4), H_UNTYPED);
  assert.ok(linesOf(text).includes('declare module "zod/*";'));
  const slice4 = ambientOf(
    build({ ...result, typedPackages: [{ name: "zod", version: "3.22.4" }] }),
  );
  assert.deepEqual(linesOf(slice4).slice(0, 4), H_TYPED);
  assert.equal(linesOf(slice4).includes('declare module "zod/*";'), false);
});

// Extends "[happy-9] a slice@3 result parsed from JSON reads its new fields as absent":
// a parsed slice@3 result builds the same project as one with empty new fields.
test("[happy-9] a slice@3 result parsed from JSON builds the same project as empty new fields", () => {
  const parsed = JSON.parse(
    '{"attempted":true,"ok":true,"diagnostics":[],"shimmedPackages":["pg"]}',
  ) as CompilationResult;
  assert.equal(parsed.typedPackages, undefined);
  assert.equal(parsed.untypedPackageErrors, undefined);
  const empty: CompilationResult = { ...parsed, typedPackages: [], untypedPackageErrors: [] };
  assert.deepEqual(build(parsed), build(empty));
  assert.notEqual(
    ambientOf(build({ ...parsed, typedPackages: [{ name: "lodash", version: "4.17.21" }] })),
    ambientOf(build(parsed)),
  );
});

// Extends "[happy-10] a slice@4 result carries typed packages and untyped-package errors":
// the scenario's own slice@4 result, read by generateProject, the only reader of typedPackages.
test("[happy-10] the slice@4 example result type-checks and its typed package is installed by generateProject", () => {
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
  const text = ambientOf(build(result));
  assert.equal(
    text,
    expected([
      ...H_TYPED,
      ...NODE,
      ...packageLines("fs"),
      ...packageLines("lodash"),
      ...packageLines("path"),
      ...packageLines("pg"),
    ]),
  );
  assert.equal(
    text,
    ambientDeclarations(["lodash", "pg", "zod", "fs", "path"], undefined, new Set(["zod"])),
  );
});

// Extends "[happy-10] the new fields take empty lists and null locations, and a typed package needs both name and version":
// more typed packages and errors, and other shapes the type refuses.
test("[happy-10] a slice@4 result with several typed packages and errors type-checks and installs each approved one", () => {
  const result: CompilationResult = {
    attempted: true,
    ok: false,
    diagnostics: [{ file: "src/app.ts", line: 2, code: "TS2322", message: "Bad." }],
    shimmedPackages: [],
    untypedPackageErrors: [
      { file: null, line: null, code: "TS7016", message: "No types." },
      { file: "src/app.ts", line: 9, code: "TS2347", message: "Untyped." },
    ],
    typedPackages: [
      { name: "lodash", version: "4.17.21" },
      { name: "zod", version: "3.23.8" },
    ],
  };
  // @ts-expect-error A typed package's version is a string.
  const numeric: CompilationResult = { ...result, typedPackages: [{ name: "zod", version: 3 }] };
  // @ts-expect-error A typed package has a name.
  const unnamed: CompilationResult = { ...result, typedPackages: [{ version: "3.22.4" }] };
  // @ts-expect-error An untyped-package error has a code and a message, like a diagnostic.
  const bare: CompilationResult = { ...result, untypedPackageErrors: [{ file: null, line: null }] };
  assert.equal(numeric.typedPackages?.length, 1);
  assert.equal(unnamed.typedPackages?.length, 1);
  assert.equal(bare.untypedPackageErrors?.length, 1);
  assert.equal(
    ambientOf(build(result)),
    expected([
      ...H_TYPED,
      ...NODE,
      ...packageLines("fs"),
      ...packageLines("path"),
      ...packageLines("pg"),
    ]),
  );
});
