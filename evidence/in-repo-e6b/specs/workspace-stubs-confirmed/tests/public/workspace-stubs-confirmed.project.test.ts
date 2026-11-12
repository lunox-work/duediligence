import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AMBIENT_PATH,
  ambientDeclarations,
  generateProject,
} from "../src/sandbox/project.js";
import type { ProjectInput, ProjectStub } from "../src/sandbox/project.js";
import type { ResolvedDependency } from "../src/sandbox/provenance.js";
import { OPERATION_POLICY } from "../src/slice/manifest.js";
import type {
  BoundaryContract,
  BoundaryModule,
  CompilationResult,
  SliceManifest,
} from "../src/slice/manifest.js";

const H = [
  "// The same declarations the slice was type-checked against: Node's",
  "// modules and globals untyped, and every package untyped. A package the",
  "// project installs is declared by a pattern, which the compiler",
  "// consults only when the package brings no types of its own.",
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

const compilation: CompilationResult = {
  attempted: true,
  ok: true,
  diagnostics: [],
  shimmedPackages: ["pg"],
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
  compilation,
  blockers: [],
};

const dependencies: readonly ResolvedDependency[] = [
  {
    name: "zod",
    kind: "package",
    version: "^3.22.0",
    resolution: "approved-package",
    detail: "Installed at the version package.json pins.",
  },
  {
    name: "lodash",
    kind: "package",
    version: "4.17.21",
    resolution: "approved-package",
    detail: "Installed at the version package.json pins.",
  },
  {
    name: "pg",
    kind: "package",
    version: "^8.11.0",
    resolution: "runtime-mock",
    detail: "Replaced by a generated recording mock package.",
  },
];

function input(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
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
    contract,
    sources: [
      {
        originalPath: "src/app.ts",
        path: "src/app.ts",
        text: "export function run() { return 1; }\n",
      },
    ],
    stubs: [],
    spec: null,
    dependencies,
    acceptanceTests: [],
    knownSpecifiers: ["fs", "path"],
    ...overrides,
  };
}

const fileOf = (project: ReturnType<typeof generateProject>, path: string) =>
  project.files.find((file) => file.path === path);

const ambientLines = (project: ReturnType<typeof generateProject>) =>
  (fileOf(project, AMBIENT_PATH)?.text ?? "").split("\n");

const withCompilation = (
  typedPackages: CompilationResult["typedPackages"] | "absent",
): BoundaryContract => ({
  ...contract,
  compilation:
    typedPackages === "absent" ? compilation : { ...compilation, typedPackages },
});

const serviceModule = (symbols: BoundaryModule["symbols"]): BoundaryModule => ({
  module: "lib/service.ts",
  symbols,
  importedBy: ["src/app.ts"],
  stubPath: "stubs/lib/service.d.ts",
});

const serviceStub = (text: string): ProjectStub => ({
  module: "lib/service.ts",
  path: "lib/service.ts",
  text,
});

test("[happy-6] approved packages get a pattern; mocked ones keep their shorthand", () => {
  const project = generateProject(
    input({ contract: withCompilation([{ name: "zod", version: "3.22.4" }]) }),
  );
  const text = fileOf(project, AMBIENT_PATH)?.text ?? "";
  assert.ok(text.startsWith(`${H.join("\n")}\n`));
  const lines = ambientLines(project);
  assert.ok(lines.includes('declare module "lodash*";'));
  assert.ok(lines.includes('declare module "zod*";'));
  for (const line of [
    'declare module "zod";',
    'declare module "zod/*";',
    'declare module "lodash";',
    'declare module "lodash/*";',
  ])
    assert.equal(lines.includes(line), false, line);
  assert.ok(lines.includes('declare module "pg";'));
  assert.ok(lines.includes('declare module "pg/*";'));
  const pkg = JSON.parse(fileOf(project, "package.json")?.text ?? "{}") as {
    dependencies?: Record<string, string>;
  };
  assert.deepEqual(pkg.dependencies, {
    lodash: "4.17.21",
    pg: "file:mocks/pg",
    zod: "^3.22.0",
  });
});

test("[happy-6] an approved package the check did not read types for is still declared by a pattern", () => {
  const project = generateProject(
    input({ contract: withCompilation([{ name: "zod", version: "3.22.4" }]) }),
  );
  const lines = ambientLines(project);
  // lodash is not in typedPackages, and it is installed all the same.
  assert.ok(lines.includes('declare module "lodash*";'));
  assert.equal(lines.includes('declare module "lodash";'), false);
  // Node's bare module names stay untyped.
  assert.ok(lines.includes('declare module "fs";'));
  assert.ok(lines.includes('declare module "fs/*";'));
});

test("[boundary-8] the ambient file does not depend on typedPackages", () => {
  const packageModules = {
    specifiers: ["pg"],
    text: 'declare module "pg" {\n  export const Pool: any;\n}\n',
  };
  const ambientWith = (typed: CompilationResult["typedPackages"] | "absent") =>
    fileOf(
      generateProject(input({ contract: withCompilation(typed), packageModules })),
      AMBIENT_PATH,
    )?.text;
  const absent = ambientWith("absent");
  const want = ambientDeclarations(
    ["lodash", "pg", "zod", "fs", "path"],
    packageModules,
    new Set(["lodash", "zod"]),
  );
  for (const typed of ["absent", [], [{ name: "zod", version: "3.22.4" }]] as const) {
    const text = ambientWith(typed);
    assert.equal(text, absent);
    assert.equal(text, want);
  }
});

test("[boundary-9] only approved, pinned packages count as installed", () => {
  const rows: readonly [string, string | null, "approved-package" | "runtime-mock", boolean, boolean][] = [
    ["zod", "1.0.0", "approved-package", true, false],
    ["stripe", "*", "runtime-mock", false, true],
    ["@acme/sdk", null, "approved-package", false, false],
  ];
  for (const [name, version, resolution, pattern, wildcard] of rows) {
    const lines = ambientLines(
      generateProject(
        input({
          dependencies: [{ name, kind: "package", version, resolution, detail: "" }],
        }),
      ),
    );
    assert.equal(lines.includes(`declare module "${name}*";`), pattern, name);
    assert.equal(lines.includes(`declare module "${name}/*";`), wildcard, name);
  }
});

test("[happy-7] a mocked module's runtime forwards its stub's relative export-star lines, others not", () => {
  const stub = [
    'export * from "./types.js";',
    "export * from '../x/y.js'",
    'export * from "zod";',
    'export * as ns from "./ns.js";',
    "export declare function createService(): Service;",
    "",
  ].join("\n");
  const project = generateProject(
    input({
      contract: {
        ...contract,
        outbound: [
          serviceModule([
            {
              name: "createService",
              kind: "function",
              declaration: "export declare function createService(): Service;",
            },
          ]),
        ],
      },
      stubs: [serviceStub(stub)],
    }),
  );
  const runtime = fileOf(project, "lib/service.js");
  assert.equal(runtime?.class, "mock");
  const text = runtime?.text ?? "";
  assert.ok(
    text.endsWith('\nexport * from "./types.js";\nexport * from "../x/y.js";\n'),
    text,
  );
  const lines = text.split("\n");
  assert.equal(lines.includes('export * from "zod";'), false);
  assert.equal(lines.some((line) => line.includes("./ns.js")), false);
  // The forwarded lines come after the module's other exports.
  const createService = lines.findIndex((line) =>
    line.includes("createService"),
  );
  assert.ok(createService !== -1);
  assert.ok(createService < lines.indexOf('export * from "./types.js";'));
  assert.equal(lines.includes("export {};"), false);
});

test("[happy-7] a forwarded line replaces the empty export of a module with only types", () => {
  const project = generateProject(
    input({
      contract: {
        ...contract,
        outbound: [
          serviceModule([
            {
              name: "Config",
              kind: "interface",
              declaration: "export interface Config {}",
            },
          ]),
        ],
      },
      stubs: [
        serviceStub('export * from "./types.js"\nexport interface Config {}\n'),
      ],
    }),
  );
  const text = fileOf(project, "lib/service.js")?.text ?? "";
  assert.ok(text.endsWith('\nexport * from "./types.js";\n'), text);
  assert.equal(text.split("\n").includes("export {};"), false);
});

test("[boundary-10] a stub the contract does not list as a module still gets an empty runtime", () => {
  const project = generateProject(
    input({
      stubs: [
        {
          module: "lib/types.ts",
          path: "lib/types.ts",
          text: 'export * from "./more.js";\n',
        },
      ],
    }),
  );
  assert.equal(fileOf(project, "lib/types.js")?.text, "export {};\n");
});
