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
import type { ArtifactFile, ToolInputs } from "../src/tools/adapter.js";
import {
  createSandboxBuildAdapter,
  descriptorTestSummary,
} from "../src/tools/sandbox-build.js";
import { sha256 } from "../src/tools/slice/hash.js";
import { fixture, slice, sliceRun, stamp } from "./fixture-slice.js";

const DESCRIPTOR = "project/sandbox-task.json";

/** A temporary directory for one test, removed after it. */
async function inTemp<T>(body: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "touched-repos-build-"));
  try {
    return await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
/** Writes `text` at `name` in `dir`, and the entry for it at `path`. */
async function entry(
  dir: string,
  name: string,
  text: string,
  path = DESCRIPTOR,
) {
  const absolutePath = join(dir, name);
  await writeFile(absolutePath, text, "utf8");
  return { path, absolutePath };
}
/** A descriptor as a build writes it, with the given summary. */
const descriptorText = (testSummary: unknown) =>
  JSON.stringify({
    schemaVersion: 1,
    sandboxId: "sbx_1",
    versionId: "sbv_1",
    version: 1,
    title: "Sum a cart",
    specSummary: "The cart adds up its lines.",
    complexity: "S",
    tags: [],
    editablePaths: ["src/cart.ts"],
    publicTests: ["tests/public/cart.test.ts"],
    testSummary,
  });

// --- descriptorTestSummary ---

test("[happy-4] a built descriptor's summary is returned as written", async () => {
  await inTemp(async (dir) => {
    const manifest = await entry(
      dir,
      "build-manifest.json",
      "{}",
      "build-manifest.json",
    );
    const descriptor = await entry(
      dir,
      "sandbox-task.json",
      descriptorText([
        { label: "public", count: 2 },
        { label: "scenarios", count: 1 },
      ]),
    );
    assert.deepEqual(await descriptorTestSummary([manifest, descriptor]), [
      { label: "public", count: 2 },
      { label: "scenarios", count: 1 },
    ]);
  });
});

test("[happy-4] the summary keeps the descriptor's entry order, whatever the labels", async () => {
  await inTemp(async (dir) => {
    const descriptor = await entry(
      dir,
      "sandbox-task.json",
      descriptorText([
        { label: "scenarios", count: 1 },
        { label: "public", count: 2 },
        { label: "extra", count: 0 },
      ]),
    );
    assert.deepEqual(await descriptorTestSummary([descriptor]), [
      { label: "scenarios", count: 1 },
      { label: "public", count: 2 },
      { label: "extra", count: 0 },
    ]);
  });
});

const holding: readonly (readonly [string, unknown])[] = [
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
for (const [text, result] of holding)
  test(`[boundary-6] a descriptor holding ${text} gives ${JSON.stringify(result) ?? "undefined"}`, async () => {
    await inTemp(async (dir) => {
      const descriptor = await entry(dir, "sandbox-task.json", text);
      assert.deepEqual(await descriptorTestSummary([descriptor]), result);
    });
  });

test("[boundary-6] a negative integer count is kept, and the rest of the descriptor is not checked", async () => {
  await inTemp(async (dir) => {
    const descriptor = await entry(
      dir,
      "sandbox-task.json",
      JSON.stringify({
        title: 7,
        testSummary: [{ label: "public", count: -3 }],
      }),
    );
    assert.deepEqual(await descriptorTestSummary([descriptor]), [
      { label: "public", count: -3 },
    ]);
  });
});

test("[unhappy-7] no files gives no summary", async () => {
  assert.equal(await descriptorTestSummary([]), undefined);
});

test("[unhappy-7] a descriptor at sandbox-task.json, outside project/, gives no summary", async () => {
  await inTemp(async (dir) => {
    const descriptor = await entry(
      dir,
      "sandbox-task.json",
      descriptorText([{ label: "public", count: 1 }]),
      "sandbox-task.json",
    );
    assert.equal(await descriptorTestSummary([descriptor]), undefined);
  });
});

test("[unhappy-7] a descriptor at project/sub/sandbox-task.json gives no summary", async () => {
  await inTemp(async (dir) => {
    const descriptor = await entry(
      dir,
      "sandbox-task.json",
      descriptorText([{ label: "public", count: 1 }]),
      "project/sub/sandbox-task.json",
    );
    assert.equal(await descriptorTestSummary([descriptor]), undefined);
  });
});

test("[unhappy-7] a descriptor entry whose file is missing gives no summary, without throwing", async () => {
  await inTemp(async (dir) => {
    assert.equal(
      await descriptorTestSummary([
        { path: DESCRIPTOR, absolutePath: join(dir, "missing.json") },
      ]),
      undefined,
    );
  });
});

test("[boundary-7] only the first entry at project/sandbox-task.json is read", async () => {
  await inTemp(async (dir) => {
    const first = await entry(
      dir,
      "first.json",
      descriptorText([{ label: "public", count: 1 }]),
    );
    const second = await entry(
      dir,
      "second.json",
      descriptorText([{ label: "public", count: 9 }]),
    );
    assert.deepEqual(await descriptorTestSummary([first, second]), [
      { label: "public", count: 1 },
    ]);
  });
});

test("[boundary-7] a malformed first entry is not passed over for a valid second one", async () => {
  await inTemp(async (dir) => {
    const first = await entry(dir, "first.json", "not json");
    const second = await entry(
      dir,
      "second.json",
      descriptorText([{ label: "public", count: 9 }]),
    );
    assert.equal(await descriptorTestSummary([first, second]), undefined);
  });
});

test("[concurrency-2] overlapping calls on the same files agree", async () => {
  await inTemp(async (dir) => {
    const files = [
      await entry(
        dir,
        "sandbox-task.json",
        descriptorText([{ label: "public", count: 2 }]),
      ),
    ];
    const [one, two] = await Promise.all([
      descriptorTestSummary(files),
      descriptorTestSummary(files),
    ]);
    assert.deepEqual(one, [{ label: "public", count: 2 }]);
    assert.deepEqual(two, [{ label: "public", count: 2 }]);
  });
});

test("[concurrency-2] overlapping calls on different descriptors each get their own", async () => {
  await inTemp(async (dir) => {
    const a = await entry(
      dir,
      "a.json",
      descriptorText([{ label: "public", count: 2 }]),
    );
    const b = await entry(
      dir,
      "b.json",
      descriptorText([{ label: "public", count: 5 }]),
    );
    const [one, two, three] = await Promise.all([
      descriptorTestSummary([a]),
      descriptorTestSummary([b]),
      descriptorTestSummary([a]),
    ]);
    assert.deepEqual(one, [{ label: "public", count: 2 }]);
    assert.deepEqual(two, [{ label: "public", count: 5 }]);
    assert.deepEqual(three, [{ label: "public", count: 2 }]);
  });
});

// --- what a committed build records ---

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
  return provider;
}

/** The sliced draft of sandbox-build.test.ts, with the given table. */
async function versionFor(
  aliasRules: AliasRule[] = [],
): Promise<StoredVersionWithSource> {
  const { artifacts, manifest, contract } = await slice();
  const scope = resolveScope({ manifest, contract });
  const source: StoredVersionWithSource["source"] = {
    sandboxVersionId: "sbv_1",
    origin: "slice",
    sourceSnapshotId: "rsn_1",
    sourceCommitSha: "a".repeat(40),
    sliceRunId: sliceRun.id,
    starterRunId: null,
    starterSha256: null,
    manifestSha256:
      artifacts.find((a) => a.kind === "slice_manifest")?.sha256 ?? "",
    contractSha256:
      artifacts.find((a) => a.kind === "boundary_contract")?.sha256 ?? "",
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
        expectedBaseline: "fail" as const,
      },
    ],
    fixtures: null,
    scope,
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

/** A build of the fixture slice in a temporary directory, removed by `done`. */
async function runBuild(
  provider: EvaluationProvider,
  version: StoredVersionWithSource,
) {
  const { artifacts, objects } = await slice();
  const outDir = await mkdtemp(join(tmpdir(), "touched-repos-build-out-"));
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
  const adapter = createSandboxBuildAdapter({
    provider,
    now: () => new Date(stamp),
  });
  const files = await adapter.run({
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
  });
  const read = (path: string) => readFile(join(outDir, path), "utf8");
  const manifest = JSON.parse(
    await read("build-manifest.json"),
  ) as SandboxBuildManifest;
  return {
    files,
    manifest,
    read,
    outDir,
    done: () => rm(outDir, { recursive: true, force: true }),
  };
}
const readyBuild = async () =>
  runBuild(
    fakeProvider((argv) => (runsHiddenTest(argv) ? TAP_FAILED : {})),
    await versionFor(),
  );
/** Commits `files` on a fresh build adapter, and what it recorded. */
async function commitBuild(files: readonly ArtifactFile[]) {
  const recorded: { versionId: string; runId: string; output: unknown }[] = [];
  const adapter = createSandboxBuildAdapter({ provider: fakeProvider() });
  await adapter.committed?.({
    runId: "arn_build",
    files: [...files],
    inputs: {
      getRun: async () => null,
      listArtifacts: async () => [],
      readArtifact: async () => undefined,
      getVersion: async () => null,
      getTask: async () => null,
      recordBuildOutput: async (versionId, runId, output) => {
        recorded.push({ versionId, runId, output });
        return true;
      },
      recordStarterOutput: async () => false,
    },
  });
  return recorded;
}
/** A build's outputs as committed reads them, written by hand. */
async function handBuilt(
  dir: string,
  ready: boolean,
  descriptor: string | null,
): Promise<ArtifactFile[]> {
  const manifestPath = join(dir, "build-manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify({
      sandboxVersionId: "sbv_1",
      ready,
      harnessSha256: "h".repeat(64),
      toolchainDigest: "sha256:toolchain",
      blockers: [],
    }),
    "utf8",
  );
  const files: ArtifactFile[] = [
    {
      path: "build-manifest.json",
      absolutePath: manifestPath,
      kind: "build_manifest",
      contentType: "application/json",
      meta: null,
    },
  ];
  if (descriptor !== null) {
    const descriptorPath = join(dir, "sandbox-task.json");
    await writeFile(descriptorPath, descriptor, "utf8");
    files.push({
      path: DESCRIPTOR,
      absolutePath: descriptorPath,
      kind: "project_file",
      contentType: "application/json",
      meta: null,
    });
  }
  return files;
}

test("[happy-7] a ready build records its descriptor's counts with its harness and toolchain", async () => {
  const build = await readyBuild();
  try {
    assert.equal(build.manifest.ready, true);
    const descriptor = JSON.parse(await build.read(DESCRIPTOR)) as {
      testSummary: unknown;
    };
    assert.deepEqual(await commitBuild(build.files), [
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
    await build.done();
  }
});

test("[happy-7] a ready build's recorded counts are its descriptor's, negative ones included", async () => {
  await inTemp(async (dir) => {
    const files = await handBuilt(
      dir,
      true,
      descriptorText([
        { label: "public", count: 4 },
        { label: "scenarios", count: -1 },
      ]),
    );
    assert.deepEqual(await commitBuild(files), [
      {
        versionId: "sbv_1",
        runId: "arn_build",
        output: {
          harnessSha256: "h".repeat(64),
          toolchainDigest: "sha256:toolchain",
          testSummary: [
            { label: "public", count: 4 },
            { label: "scenarios", count: -1 },
          ],
        },
      },
    ]);
  });
});

test("[unhappy-8] a build that ends with a blocker records nothing, counts included", async () => {
  const build = await runBuild(
    fakeProvider(),
    await versionFor([
      { before: "run", after: "client", kind: "identifier", paths: [] },
    ]),
  );
  try {
    assert.equal(build.manifest.ready, false);
    assert.deepEqual(await commitBuild(build.files), []);
  } finally {
    await build.done();
  }
});

test("[unhappy-8] a build that is not ready records nothing, even beside a valid descriptor", async () => {
  await inTemp(async (dir) => {
    const files = await handBuilt(
      dir,
      false,
      descriptorText([{ label: "public", count: 2 }]),
    );
    assert.deepEqual(await commitBuild(files), []);
  });
});

test("[boundary-8] a ready build committed without its descriptor records what it would have, with no testSummary key", async () => {
  const build = await readyBuild();
  try {
    assert.equal(build.manifest.ready, true);
    const recorded = await commitBuild(
      build.files.filter((file) => file.path !== DESCRIPTOR),
    );
    assert.equal(recorded.length, 1);
    const output = recorded[0]?.output as Record<string, unknown>;
    assert.equal("testSummary" in output, false);
    assert.deepEqual(recorded, [
      {
        versionId: "sbv_1",
        runId: "arn_build",
        output: {
          harnessSha256: build.manifest.harnessSha256,
          toolchainDigest: build.manifest.toolchainDigest,
        },
      },
    ]);
  } finally {
    await build.done();
  }
});

test("[boundary-8] a ready build whose descriptor has no valid testSummary records no testSummary key", async () => {
  await inTemp(async (dir) => {
    const files = await handBuilt(
      dir,
      true,
      '{"testSummary":[{"label":"public","count":1.5}]}',
    );
    const recorded = await commitBuild(files);
    assert.equal(recorded.length, 1);
    const output = recorded[0]?.output as Record<string, unknown>;
    assert.equal("testSummary" in output, false);
    assert.deepEqual(output, {
      harnessSha256: "h".repeat(64),
      toolchainDigest: "sha256:toolchain",
    });
  });
});
