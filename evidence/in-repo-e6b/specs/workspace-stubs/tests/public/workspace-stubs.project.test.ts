import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AMBIENT_PATH,
  ambientDeclarations,
  generateProject,
} from "../src/sandbox/project.js";
import type { ProjectInput } from "../src/sandbox/project.js";
import type { ResolvedDependency } from "../src/sandbox/provenance.js";
import { OPERATION_POLICY } from "../src/slice/manifest.js";
import type {
  BoundaryContract,
  CompilationResult,
  SliceManifest,
} from "../src/slice/manifest.js";

const H_UNTYPED = [
  "// The same declarations the slice was type-checked against: Node's",
  "// modules and globals untyped, and every package untyped. The project",
  "// installs its approved packages for real; their own types are not",
  "// consulted, so a contribution is checked against the slice's contract.",
].join("\n");
const H_TYPED = [
  "// The same declarations the slice was type-checked against: Node's",
  "// modules and globals untyped, and every package untyped but those the",
  "// project installs and the slice was checked against: they keep their",
  "// own published types.",
].join("\n");

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

const compilation: CompilationResult = {
  attempted: true,
  ok: true,
  diagnostics: [],
  shimmedPackages: ["pg"],
};

const contractWith = (
  typedPackages: CompilationResult["typedPackages"] | "absent",
): BoundaryContract => ({
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
  compilation:
    typedPackages === "absent"
      ? compilation
      : { ...compilation, typedPackages },
  blockers: [],
});

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

const KNOWN_SPECIFIERS = ["fs", "path"];

function project(
  typedPackages: CompilationResult["typedPackages"] | "absent",
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
    contract: contractWith(typedPackages),
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
    knownSpecifiers: KNOWN_SPECIFIERS,
    ...overrides,
  });
}

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

test("[happy-6] a typed approved package loses its shorthand and wildcard; an untyped one keeps them", () => {
  const result = project([{ name: "zod", version: "3.22.4" }]);
  const text = ambientOf(result);
  assert.ok(text.startsWith(`${H_TYPED}\n`));
  const lines = linesOf(text);
  assert.equal(lines.includes('declare module "zod";'), false);
  assert.equal(lines.includes('declare module "zod/*";'), false);
  for (const line of [
    'declare module "lodash";',
    'declare module "lodash/*";',
    'declare module "pg";',
    'declare module "pg/*";',
  ])
    assert.ok(lines.includes(line), line);
  assert.deepEqual(dependenciesOf(result), {
    lodash: "4.17.21",
    pg: "file:mocks/pg",
    zod: "^3.22.0",
  });
});

test("[happy-6] the ambient file is ambientDeclarations of the same packages with the typed approved package installed, and nothing else changes", () => {
  const typed = project([{ name: "zod", version: "3.22.4" }]);
  const untyped = project("absent");
  assert.equal(
    ambientOf(typed),
    ambientDeclarations(
      ["lodash", "pg", "zod", "fs", "path"],
      undefined,
      new Set(["zod"]),
    ),
  );
  // Only the ambient file's text differs.
  assert.deepEqual(
    typed.files.map((file) => file.path),
    untyped.files.map((file) => file.path),
  );
  for (const [index, file] of typed.files.entries())
    if (file.path !== AMBIENT_PATH)
      assert.deepEqual(file, untyped.files[index], file.path);
  assert.deepEqual(typed.blockers, untyped.blockers);
  assert.deepEqual(typed.importRewrites, untyped.importRewrites);
  assert.deepEqual(typed.descriptor, untyped.descriptor);
  assert.deepEqual(typed.publicTests, untyped.publicTests);
});

test("[boundary-8] a contract without typedPackages builds the ambient file as before", () => {
  const packageModules = {
    specifiers: ["lodash"],
    text: 'declare module "lodash" {\n  export const chunk: any;\n}\n',
  };
  const text = ambientOf(project("absent", { packageModules }));
  assert.ok(text.startsWith(`${H_UNTYPED}\n`));
  const lines = linesOf(text);
  assert.ok(lines.includes('declare module "zod";'));
  assert.ok(lines.includes('declare module "zod/*";'));
  assert.equal(
    text,
    ambientDeclarations(["lodash", "pg", "zod", "fs", "path"], packageModules),
  );
});

test("[boundary-8] without typedPackages or packageModules every approved and mocked package keeps both lines", () => {
  const text = ambientOf(project("absent"));
  assert.equal(
    text,
    ambientDeclarations(["lodash", "pg", "zod", "fs", "path"]),
  );
  const lines = linesOf(text);
  for (const name of ["lodash", "pg", "zod"]) {
    assert.ok(lines.includes(`declare module "${name}";`), name);
    assert.ok(lines.includes(`declare module "${name}/*";`), name);
  }
});

test("[boundary-9] an empty typedPackages is the same as an absent one", () => {
  assert.equal(ambientOf(project([])), ambientOf(project("absent")));
});

test("[boundary-9] typedPackages naming only packages the project does not install is the same as an absent one", () => {
  const text = ambientOf(
    project([
      { name: "react", version: "18.3.1" },
      { name: "pg", version: "8.11.3" },
    ]),
  );
  assert.equal(text, ambientOf(project("absent")));
  assert.ok(text.startsWith(`${H_UNTYPED}\n`));
});

test("[boundary-10] only approved, pinned packages can count as installed", () => {
  const rows: readonly {
    name: string;
    version: string | null;
    resolution: ResolvedDependency["resolution"];
    has: boolean;
  }[] = [
    { name: "zod", version: "1.0.0", resolution: "approved-package", has: false },
    { name: "stripe", version: "*", resolution: "runtime-mock", has: true },
    {
      name: "@acme/sdk",
      version: null,
      resolution: "approved-package",
      has: false,
    },
  ];
  for (const row of rows) {
    const text = ambientOf(
      project([{ name: row.name, version: "1.0.0" }], {
        dependencies: [dependency(row.name, row.version, row.resolution)],
      }),
    );
    assert.equal(
      linesOf(text).includes(`declare module "${row.name}/*";`),
      row.has,
      row.name,
    );
  }
});

test("[boundary-10] a mocked or unpinned package named in typedPackages leaves the installed set empty, so the header stays untyped", () => {
  for (const item of [
    dependency("stripe", "*", "runtime-mock"),
    dependency("@acme/sdk", null, "approved-package"),
  ]) {
    const text = ambientOf(
      project([{ name: item.name, version: "1.0.0" }], {
        dependencies: [item],
      }),
    );
    assert.ok(text.startsWith(`${H_UNTYPED}\n`), item.name);
  }
  // The approved, pinned one is installed whatever version its types were read at.
  const installed = ambientOf(
    project([{ name: "zod", version: "9.9.9" }], {
      dependencies: [dependency("zod", "1.0.0", "approved-package")],
    }),
  );
  assert.ok(installed.startsWith(`${H_TYPED}\n`));
  assert.equal(
    installed,
    ambientDeclarations(["zod", "fs", "path"], undefined, new Set(["zod"])),
  );
});
