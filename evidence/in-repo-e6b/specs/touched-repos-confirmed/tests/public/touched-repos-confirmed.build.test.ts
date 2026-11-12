import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { StoredVersionWithSource } from "@sandbox-factory/db";
import {
  canonicalJson,
  resolveScope,
  transformConfigOf,
} from "sandbox-factory";
import type {
  AliasRule,
  EvaluationCommand,
  EvaluationExecResult,
  EvaluationProvider,
  SandboxBuildManifest,
} from "sandbox-factory";
import type { ToolInputs, ToolRunInput } from "../src/tools/adapter.js";
import {
  createSandboxBuildAdapter,
  descriptorTestSummary,
} from "../src/tools/sandbox-build.js";
import { sha256 } from "../src/tools/slice/hash.js";
import { fixture, slice, sliceRun, stamp } from "./fixture-slice.js";

const DESCRIPTOR = "project/sandbox-task.json";

/** A scratch directory for the files a test hands descriptorTestSummary. */
async function scratch<T>(body: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "touched-descriptor-"));
  try {
    return await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function written(dir: string, name: string, text: string) {
  const path = join(dir, name);
  await writeFile(path, text, "utf8");
  return path;
}
const descriptorText = (testSummary: unknown) =>
  JSON.stringify({
    schemaVersion: 1,
    title: "Sum a cart",
    editablePaths: ["src/cart.ts"],
    publicTests: ["tests/public/cart.test.ts"],
    testSummary,
  });

// --- descriptorTestSummary ---

test("[happy-4] a built descriptor's summary is returned as written", async () => {
  await scratch(async (dir) => {
    const manifest = await written(dir, "build-manifest.json", "{}");
    const descriptor = await written(
      dir,
      "sandbox-task.json",
      descriptorText([
        { label: "public", count: 2 },
        { label: "scenarios", count: 1 },
      ]),
    );
    assert.deepEqual(
      await descriptorTestSummary([
        { path: "build-manifest.json", absolutePath: manifest },
        { path: DESCRIPTOR, absolutePath: descriptor },
      ]),
      [
        { label: "public", count: 2 },
        { label: "scenarios", count: 1 },
      ],
    );
  });
});

test("[boundary-9] what the descriptor's testSummary holds decides the result", async () => {
  const cases: [string, unknown][] = [
    ['{"testSummary":[]}', []],
    [
      '{"testSummary":[{"label":"public","count":1,"extra":true}]}',
      [{ label: "public", count: 1 }],
    ],
    ['{"title":"x"}', undefined],
    ['{"testSummary":{"public":1}}', undefined],
    ['{"testSummary":[{"label":"public","count":1.5}]}', undefined],
    ['{"testSummary":[{"label":"public","count":"2"}]}', undefined],
    ['{"testSummary":[{"label":"public","count":1},{"count":2}]}', undefined],
    ["not json", undefined],
    ["null", undefined],
  ];
  await scratch(async (dir) => {
    for (const [index, [text, expected]] of cases.entries()) {
      const path = await written(dir, `descriptor-${index}.json`, text);
      assert.deepEqual(
        await descriptorTestSummary([{ path: DESCRIPTOR, absolutePath: path }]),
        expected,
        text,
      );
    }
  });
});

test("[unhappy-7] without a readable descriptor entry at exactly project/sandbox-task.json there is no summary", async () => {
  await scratch(async (dir) => {
    const valid = await written(
      dir,
      "valid.json",
      descriptorText([{ label: "public", count: 1 }]),
    );
    assert.equal(await descriptorTestSummary([]), undefined);
    assert.equal(
      await descriptorTestSummary([
        { path: "sandbox-task.json", absolutePath: valid },
      ]),
      undefined,
    );
    assert.equal(
      await descriptorTestSummary([
        { path: "project/sub/sandbox-task.json", absolutePath: valid },
      ]),
      undefined,
    );
    assert.equal(
      await descriptorTestSummary([
        { path: DESCRIPTOR, absolutePath: join(dir, "missing.json") },
      ]),
      undefined,
    );
  });
});

test("[boundary-10] only the first entry at project/sandbox-task.json is read", async () => {
  await scratch(async (dir) => {
    const first = await written(
      dir,
      "first.json",
      descriptorText([{ label: "public", count: 1 }]),
    );
    const second = await written(
      dir,
      "second.json",
      descriptorText([{ label: "public", count: 9 }]),
    );
    assert.deepEqual(
      await descriptorTestSummary([
        { path: DESCRIPTOR, absolutePath: first },
        { path: DESCRIPTOR, absolutePath: second },
      ]),
      [{ label: "public", count: 1 }],
    );
  });
});

test("[concurrency-2] overlapping calls on the same files agree", async () => {
  await scratch(async (dir) => {
    const path = await written(
      dir,
      "descriptor.json",
      descriptorText([{ label: "public", count: 2 }]),
    );
    const files = [{ path: DESCRIPTOR, absolutePath: path }];
    const [one, two] = await Promise.all([
      descriptorTestSummary(files),
      descriptorTestSummary(files),
    ]);
    assert.deepEqual(one, [{ label: "public", count: 2 }]);
    assert.deepEqual(two, [{ label: "public", count: 2 }]);
  });
});

// --- A build's committed records the descriptor's counts ---

const TAP_FAILED = {
  exitCode: 1,
  stdout:
    "TAP version 13\nnot ok 1 - fails\n  failureType: 'testCodeFailure'\n1..1\n# tests 1\n# pass 0\n# fail 1\n",
};
const runsHiddenTest = (argv: readonly string[]) =>
  argv.includes("--test-reporter=tap");
function fakeProvider(
  script: (
    argv: readonly string[],
  ) => Partial<EvaluationExecResult> = () => ({}),
) {
  const provider: EvaluationProvider = {
    name: "fake",
    async create() {
      return {
        id: "job_1",
        environment: {
          provider: "fake",
          environmentId: "env_1",
          templateDigest: "sha256:template",
        },
        async stage() {},
        async exec(command: EvaluationCommand) {
          return {
            exitCode: 0,
            timedOut: false,
            outputTruncated: false,
            stdout: "",
            stderr: "",
            durationMs: 1,
            ...script(command.argv),
          };
        },
        async read(path) {
          return path === "package-lock.json" ? '{"lockfileVersion":3}' : null;
        },
        async destroy() {},
      };
    },
  };
  return { provider };
}

/** The sliced draft sandbox-build.test.ts builds, with the alias rules given. */
async function versionFor(
  aliasRules: AliasRule[] = [],
): Promise<StoredVersionWithSource> {
  const { artifacts, manifest, contract } = await slice();
  const manifestSha =
    artifacts.find((a) => a.kind === "slice_manifest")?.sha256 ?? "";
  const contractSha =
    artifacts.find((a) => a.kind === "boundary_contract")?.sha256 ?? "";
  const source: StoredVersionWithSource["source"] = {
    sandboxVersionId: "sbv_1",
    origin: "slice",
    sourceSnapshotId: "rsn_1",
    sourceCommitSha: "a".repeat(40),
    sliceRunId: sliceRun.id,
    starterRunId: null,
    starterSha256: null,
    manifestSha256: manifestSha,
    contractSha256: contractSha,
    transformConfigSha256: "",
    approvedTaskSha256: "",
    proposalVersion: 1,
    contextVersions: { jira: null, github: null },
    approvedTask: {
      schemaVersion: 1,
      title: "Fix the widget",
      summary: "Make it work.",
      spec: {
        proposalId: "bpr_1",
        specRevision: 1,
        specHash: "s".repeat(64),
        draft: {
          feature: "Widget",
          background: [],
          scenarios: [
            {
              id: "s1",
              kind: "happy",
              title: "createService describes a thing",
              steps: [{ keyword: "When", text: "createService runs" }],
              origin: "draft",
            },
          ],
          openQuestions: [],
          assumptions: [],
        },
      },
      pricing: null,
      selectedBy: "user_1",
      selectedAt: stamp,
      jiraIssueIds: [],
    },
    aliasRules,
    dependencyChoices: {},
    acceptanceTests: [
      {
        path: "tests/private/fix.test.ts",
        text: 'import { test } from "node:test";\ntest("fixed", () => { throw new Error("not yet"); });\n',
        expectedBaseline: "fail",
      },
    ],
    fixtures: null,
    scope: resolveScope({ manifest, contract }),
    harnessSha256: null,
    toolchainDigest: null,
    buildRunId: null,
    roundTripRunId: null,
    disclosureRunId: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  return {
    version: {
      id: "sbv_1",
      sandboxId: "sbx_1",
      version: 1,
      title: "Fix the widget",
      specSummary: "Make it work.",
      complexity: "M",
      tags: ["typescript"],
      testSummary: [],
      publicBaseCommitSha: null,
      readme: null,
      languages: null,
      frozenAt: null,
      createdAt: stamp,
    },
    source: {
      ...source,
      transformConfigSha256: sha256(
        canonicalJson(
          transformConfigOf({
            aliasRules: source.aliasRules,
            dependencyChoices: source.dependencyChoices,
            acceptanceTests: source.acceptanceTests,
            fixtures: source.fixtures,
            starterSha256: source.starterSha256,
          }),
        ),
      ),
      approvedTaskSha256: sha256(canonicalJson(source.approvedTask)),
    },
  };
}

/** A sandbox build of the draft, run to its end; its files and manifest. */
async function runBuild(
  provider: EvaluationProvider,
  version: StoredVersionWithSource,
) {
  const { artifacts, objects } = await slice();
  const outDir = await mkdtemp(join(tmpdir(), "touched-build-"));
  const inputs: ToolInputs = {
    getRun: async (id) =>
      id === sliceRun.id ? { ...sliceRun, status: "succeeded" } : null,
    listArtifacts: async (id) => (id === sliceRun.id ? artifacts : []),
    readArtifact: async (key) => objects.get(key),
    getVersion: async (id) => (id === "sbv_1" ? version : null),
    getTask: async () => null,
    recordBuildOutput: async () => false,
    recordStarterOutput: async () => false,
  };
  const input: ToolRunInput = {
    runId: "arn_build",
    sourceDir: fixture,
    outDir,
    params: {
      deadlineMinutes: 30,
      sliceRunId: sliceRun.id,
      sandboxVersionId: "sbv_1",
      manifestSha256: version.source.manifestSha256 ?? "",
      contractSha256: version.source.contractSha256 ?? "",
      transformConfigSha256: version.source.transformConfigSha256,
      approvedTaskSha256: version.source.approvedTaskSha256,
    } as never,
    run: { snapshotId: "rsn_1", commitSha: "a".repeat(40) },
    inputs,
    signal: new AbortController().signal,
    log: () => {},
  };
  const adapter = createSandboxBuildAdapter({
    provider,
    now: () => new Date(stamp),
  });
  const files = await adapter.run(input);
  const read = async (path: string) => readFile(join(outDir, path), "utf8");
  const manifest = JSON.parse(
    await read("build-manifest.json"),
  ) as SandboxBuildManifest;
  return { adapter, files, manifest, read, outDir };
}
function recording(
  recorded: {
    versionId: string;
    runId: string;
    output: Record<string, unknown>;
  }[],
): ToolInputs {
  return {
    getRun: async () => null,
    listArtifacts: async () => [],
    readArtifact: async () => undefined,
    getVersion: async () => null,
    getTask: async () => null,
    recordBuildOutput: async (versionId, runId, output) => {
      recorded.push({
        versionId,
        runId,
        output: output as unknown as Record<string, unknown>,
      });
      return true;
    },
    recordStarterOutput: async () => false,
  };
}
const readyProvider = () =>
  fakeProvider((argv) => (runsHiddenTest(argv) ? TAP_FAILED : {})).provider;

test("[happy-7] a ready build records its descriptor's counts with its harness", async () => {
  const build = await runBuild(readyProvider(), await versionFor());
  try {
    assert.equal(build.manifest.ready, true);
    const descriptor = JSON.parse(await build.read(DESCRIPTOR)) as {
      testSummary: unknown;
    };
    const recorded: {
      versionId: string;
      runId: string;
      output: Record<string, unknown>;
    }[] = [];
    await build.adapter.committed?.({
      runId: "arn_build",
      files: build.files,
      inputs: recording(recorded),
    });
    assert.deepEqual(recorded, [
      {
        versionId: "sbv_1",
        runId: "arn_build",
        output: {
          harnessSha256: build.manifest.harnessSha256,
          toolchainDigest: build.manifest.toolchainDigest,
          testSummary: descriptor.testSummary,
        },
      },
    ]);
  } finally {
    await rm(build.outDir, { recursive: true, force: true });
  }
});

test("[unhappy-8] a build that is not ready records nothing, counts included", async () => {
  const build = await runBuild(
    fakeProvider().provider,
    await versionFor([
      { before: "run", after: "client", kind: "identifier", paths: [] },
    ]),
  );
  try {
    assert.equal(build.manifest.ready, false);
    const recorded: {
      versionId: string;
      runId: string;
      output: Record<string, unknown>;
    }[] = [];
    await build.adapter.committed?.({
      runId: "arn_build",
      files: build.files,
      inputs: recording(recorded),
    });
    assert.deepEqual(recorded, []);
  } finally {
    await rm(build.outDir, { recursive: true, force: true });
  }
});

test("[boundary-11] a build committed without its descriptor leaves the testSummary key out, the rest unchanged", async () => {
  const build = await runBuild(readyProvider(), await versionFor());
  try {
    assert.equal(build.manifest.ready, true);
    const recorded: {
      versionId: string;
      runId: string;
      output: Record<string, unknown>;
    }[] = [];
    await build.adapter.committed?.({
      runId: "arn_build",
      files: build.files.filter((file) => file.path !== DESCRIPTOR),
      inputs: recording(recorded),
    });
    assert.equal(recorded.length, 1);
    const output = recorded[0]?.output ?? {};
    assert.equal("testSummary" in output, false);
    assert.deepEqual(output, {
      harnessSha256: build.manifest.harnessSha256,
      toolchainDigest: build.manifest.toolchainDigest,
    });
  } finally {
    await rm(build.outDir, { recursive: true, force: true });
  }
});
