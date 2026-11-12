import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  EvaluationCommand,
  EvaluationExecResult,
  EvaluationProvider,
  SandboxBuildManifest,
} from "sandbox-factory";
import type { ArtifactFile, ToolInputs } from "../../src/tools/adapter.js";
import {
  BUILD_TRANSFORM_PATH,
  createSandboxBuildAdapter,
  descriptorTestSummary,
} from "../../src/tools/sandbox-build.js";
import { sha256 } from "../../src/tools/slice/hash.js";
import { fixture, slice, sliceRun, stamp } from "../fixture-slice.js";

const DESCRIPTOR = "project/sandbox-task.json";

/** A temporary directory for one test, removed after it. */
async function inTemp<T>(body: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "hidden-touched-repos-build-"));
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

// --- descriptorTestSummary: the summary as written ---

// Extends "[happy-4] a built descriptor's summary is returned as written":
// the descriptor among many other entries, not last, with more entries.
test("[happy-4] the descriptor is found among other files, wherever it is, and its whole summary returned", async () => {
  await inTemp(async (dir) => {
    const others = await Promise.all(
      ["README.md", "build-manifest.json", "project/README.md"].map(
        (path, index) => entry(dir, `other${index}.txt`, "{}", path),
      ),
    );
    const summary = [
      { label: "public", count: 12 },
      { label: "scenarios", count: 0 },
      { label: "", count: 3 },
      { label: "ünïcode ✓", count: 100000 },
      { label: "public", count: 1 },
    ];
    const descriptor = await entry(dir, "task.json", descriptorText(summary));
    for (const files of [
      [descriptor, ...others],
      [others[0]!, descriptor, others[1]!, others[2]!],
      [...others, descriptor],
    ])
      assert.deepEqual(await descriptorTestSummary(files), summary);
  });
});

// A descriptor whose other fields are wrong still gives its summary.
test("[happy-4] the summary is returned however wrong the rest of the descriptor is", async () => {
  await inTemp(async (dir) => {
    const descriptor = await entry(
      dir,
      "task.json",
      JSON.stringify({
        schemaVersion: "one",
        sandboxId: null,
        tags: "none",
        publicTests: 3,
        testSummary: [
          { label: "public", count: 2 },
          { label: "scenarios", count: 5 },
        ],
      }),
    );
    assert.deepEqual(await descriptorTestSummary([descriptor]), [
      { label: "public", count: 2 },
      { label: "scenarios", count: 5 },
    ]);
  });
});

// --- descriptorTestSummary: what the descriptor holds ---

// Extends the "[boundary-6] a descriptor holding …" table with other texts.
const holding: readonly (readonly [string, string, unknown])[] = [
  [
    "extra keys on every entry, dropped",
    '{"testSummary":[{"count":1,"label":"a","x":1},{"y":[2],"label":"b","count":2,"z":null}]}',
    [
      { label: "a", count: 1 },
      { label: "b", count: 2 },
    ],
  ],
  [
    "a zero and a negative count",
    '{"testSummary":[{"label":"public","count":0},{"label":"scenarios","count":-40}]}',
    [
      { label: "public", count: 0 },
      { label: "scenarios", count: -40 },
    ],
  ],
  [
    "a count written 2.0, which JSON reads as the integer 2",
    '{"testSummary":[{"label":"public","count":2.0}]}',
    [{ label: "public", count: 2 }],
  ],
  [
    "whitespace around the JSON",
    '\n  {"testSummary": [ {"label": "public", "count": 4} ]}\n\n',
    [{ label: "public", count: 4 }],
  ],
  [
    "an empty label",
    '{"testSummary":[{"label":"","count":1}]}',
    [{ label: "", count: 1 }],
  ],
  ["an empty file", "", undefined],
  ["a top-level array", '[{"label":"public","count":1}]', undefined],
  ["a top-level string", '"testSummary"', undefined],
  ["a top-level number", "7", undefined],
  ["testSummary null", '{"testSummary":null}', undefined],
  ["testSummary a string", '{"testSummary":"public: 1"}', undefined],
  ["testSummary a number", '{"testSummary":1}', undefined],
  ["an entry that is not an object", '{"testSummary":["public"]}', undefined],
  ["an entry that is null", '{"testSummary":[null]}', undefined],
  [
    "a label that is a number",
    '{"testSummary":[{"label":1,"count":1}]}',
    undefined,
  ],
  [
    "a label that is null",
    '{"testSummary":[{"label":null,"count":1}]}',
    undefined,
  ],
  [
    "a count that is null",
    '{"testSummary":[{"label":"public","count":null}]}',
    undefined,
  ],
  [
    "a count that is a boolean",
    '{"testSummary":[{"label":"public","count":true}]}',
    undefined,
  ],
  [
    "a count too large to be a number",
    '{"testSummary":[{"label":"public","count":1e400}]}',
    undefined,
  ],
  [
    "a negative fraction among good entries",
    '{"testSummary":[{"label":"public","count":1},{"label":"scenarios","count":-0.5},{"label":"x","count":3}]}',
    undefined,
  ],
  [
    "an entry with no count, before a good one",
    '{"testSummary":[{"label":"public"},{"label":"public","count":1}]}',
    undefined,
  ],
  [
    "JSON cut short",
    '{"testSummary":[{"label":"public","count":1}]',
    undefined,
  ],
  [
    "two JSON documents",
    '{"testSummary":[]}{"testSummary":[]}',
    undefined,
  ],
  [
    "testSummary only inside another key",
    '{"descriptor":{"testSummary":[{"label":"public","count":1}]}}',
    undefined,
  ],
];
for (const [what, text, result] of holding)
  test(`[boundary-6] a descriptor holding ${what} gives ${JSON.stringify(result) ?? "undefined"}`, async () => {
    await inTemp(async (dir) => {
      const descriptor = await entry(dir, "task.json", text);
      assert.deepEqual(await descriptorTestSummary([descriptor]), result);
    });
  });

// The extra keys are not there at all, not merely equal: the entries hold label and count only.
test("[boundary-6] each returned entry has exactly the keys label and count", async () => {
  await inTemp(async (dir) => {
    const descriptor = await entry(
      dir,
      "task.json",
      '{"testSummary":[{"label":"public","count":1,"extra":true,"label2":"x"}]}',
    );
    const summary = await descriptorTestSummary([descriptor]);
    assert.ok(summary !== undefined);
    assert.equal(summary.length, 1);
    assert.deepEqual(Object.keys(summary[0]!).sort(), ["count", "label"]);
  });
});

// --- descriptorTestSummary: no readable descriptor entry ---

// Extends "[unhappy-7] a descriptor at project/sub/sandbox-task.json gives no
// summary": other paths that are not exactly project/sandbox-task.json.
for (const path of [
  "./project/sandbox-task.json",
  "/project/sandbox-task.json",
  "out/project/sandbox-task.json",
  "Project/sandbox-task.json",
  "project/Sandbox-Task.json",
  "project/sandbox-task.json ",
  "project//sandbox-task.json",
  "project\\sandbox-task.json",
  "project/sandbox-task.json.bak",
  "project/sandbox-task",
  "build-manifest.json",
])
  test(`[unhappy-7] a valid descriptor at ${JSON.stringify(path)} gives no summary`, async () => {
    await inTemp(async (dir) => {
      const descriptor = await entry(
        dir,
        "task.json",
        descriptorText([{ label: "public", count: 1 }]),
        path,
      );
      assert.equal(await descriptorTestSummary([descriptor]), undefined);
    });
  });

// Extends "[unhappy-7] a descriptor entry whose file is missing": a file that
// cannot be read for another reason.
test("[unhappy-7] a descriptor entry that points at a directory gives no summary, without throwing", async () => {
  await inTemp(async (dir) => {
    const absolutePath = join(dir, "a-directory");
    await mkdir(absolutePath);
    assert.equal(
      await descriptorTestSummary([{ path: DESCRIPTOR, absolutePath }]),
      undefined,
    );
  });
});

test("[unhappy-7] a descriptor entry in a missing directory gives no summary, without throwing", async () => {
  await inTemp(async (dir) => {
    assert.equal(
      await descriptorTestSummary([
        {
          path: DESCRIPTOR,
          absolutePath: join(dir, "nowhere", "deeper", "sandbox-task.json"),
        },
      ]),
      undefined,
    );
  });
});

// Valid descriptors at wrong paths beside other files give nothing either.
test("[unhappy-7] many files, none at exactly project/sandbox-task.json, give no summary", async () => {
  await inTemp(async (dir) => {
    const text = descriptorText([{ label: "public", count: 1 }]);
    const files = await Promise.all(
      [
        "sandbox-task.json",
        "project/sub/sandbox-task.json",
        "project/sandbox-task.jsonl",
        "xproject/sandbox-task.json",
      ].map((path, index) => entry(dir, `d${index}.json`, text, path)),
    );
    assert.equal(await descriptorTestSummary(files), undefined);
  });
});

// --- descriptorTestSummary: only the first matching entry ---

// Extends "[boundary-7] a malformed first entry is not passed over": a first
// entry that cannot be read, or whose summary does not match the schema.
test("[boundary-7] a first descriptor entry whose file is missing is not passed over for a valid second one", async () => {
  await inTemp(async (dir) => {
    const second = await entry(
      dir,
      "second.json",
      descriptorText([{ label: "public", count: 9 }]),
    );
    assert.equal(
      await descriptorTestSummary([
        { path: DESCRIPTOR, absolutePath: join(dir, "missing.json") },
        second,
      ]),
      undefined,
    );
  });
});

test("[boundary-7] a first descriptor with a malformed summary is not passed over for a valid second one", async () => {
  await inTemp(async (dir) => {
    const first = await entry(
      dir,
      "first.json",
      '{"testSummary":[{"label":"public","count":"1"}]}',
    );
    const second = await entry(
      dir,
      "second.json",
      descriptorText([{ label: "public", count: 9 }]),
    );
    assert.equal(await descriptorTestSummary([first, second]), undefined);
  });
});

// Extends "[boundary-7] only the first entry at project/sandbox-task.json is
// read": three matching entries among others, the first after a near miss.
test("[boundary-7] of three matching entries after a near miss, only the first matching one is read", async () => {
  await inTemp(async (dir) => {
    const nearMiss = await entry(
      dir,
      "near.json",
      descriptorText([{ label: "public", count: 5 }]),
      "project/sub/sandbox-task.json",
    );
    const first = await entry(dir, "first.json", '{"testSummary":[]}');
    const second = await entry(
      dir,
      "second.json",
      descriptorText([{ label: "public", count: 9 }]),
    );
    const third = await entry(
      dir,
      "third.json",
      descriptorText([{ label: "public", count: 3 }]),
    );
    assert.deepEqual(
      await descriptorTestSummary([nearMiss, first, second, third]),
      [],
    );
    assert.deepEqual(await descriptorTestSummary([nearMiss, third, first]), [
      { label: "public", count: 3 },
    ]);
  });
});

// --- descriptorTestSummary: overlapping calls ---

// Extends "[concurrency-2] overlapping calls on the same files agree": many
// calls at once, on good and bad entries mixed.
test("[concurrency-2] twenty overlapping calls on good and bad descriptors each get their own result", async () => {
  await inTemp(async (dir) => {
    const good = await entry(
      dir,
      "good.json",
      descriptorText([
        { label: "public", count: 2 },
        { label: "scenarios", count: 1 },
      ]),
    );
    const bad = await entry(dir, "bad.json", "not json");
    const missing = { path: DESCRIPTOR, absolutePath: join(dir, "none.json") };
    const choices = [[good], [bad], [missing], [good, bad], [bad, good]];
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        descriptorTestSummary(choices[index % choices.length]!),
      ),
    );
    results.forEach((result, index) => {
      const choice = index % choices.length;
      assert.deepEqual(
        result,
        choice === 0 || choice === 3
          ? [
              { label: "public", count: 2 },
              { label: "scenarios", count: 1 },
            ]
          : undefined,
      );
    });
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

/** The sliced draft of sandbox-build.test.ts. */
async function versionFor(): Promise<StoredVersionWithSource> {
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
    aliasRules: [],
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

/** A ready build of the fixture slice in a temporary directory, removed by `done`. */
async function readyBuild() {
  const version = await versionFor();
  const provider = fakeProvider((argv) =>
    runsHiddenTest(argv) ? TAP_FAILED : {},
  );
  const { artifacts, objects } = await slice();
  const outDir = await mkdtemp(join(tmpdir(), "hidden-touched-repos-out-"));
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
/** Commits `files` on a fresh build adapter, and what it recorded. */
async function commitBuild(
  files: readonly ArtifactFile[],
  runId = "arn_build",
) {
  const recorded: { versionId: string; runId: string; output: unknown }[] = [];
  const adapter = createSandboxBuildAdapter({ provider: fakeProvider() });
  await adapter.committed?.({
    runId,
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
const artifact = (
  path: string,
  absolutePath: string,
  kind: ArtifactFile["kind"],
): ArtifactFile => ({
  path,
  absolutePath,
  kind,
  contentType: "application/json",
  meta: null,
});
/** A build's outputs as committed reads them, written by hand. */
async function handBuilt(
  dir: string,
  options: {
    readonly ready: boolean;
    readonly descriptor: string | null;
    readonly versionId?: string;
    readonly transform?: boolean;
    readonly descriptorFirst?: boolean;
  },
): Promise<ArtifactFile[]> {
  const manifestPath = join(dir, "build-manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify({
      sandboxVersionId: options.versionId ?? "sbv_1",
      ready: options.ready,
      harnessSha256: "h".repeat(64),
      toolchainDigest: "sha256:toolchain",
      blockers: [],
    }),
    "utf8",
  );
  const files: ArtifactFile[] = [
    artifact("build-manifest.json", manifestPath, "build_manifest"),
  ];
  if (options.transform === true) {
    const transformPath = join(dir, "build-transform.json");
    await writeFile(
      transformPath,
      JSON.stringify({
        fromTransformConfigSha256: "f".repeat(64),
        transformConfigSha256: "t".repeat(64),
        aliasRules: [
          { before: "Acme", after: "Shop", kind: "identifier", paths: [] },
        ],
      }),
      "utf8",
    );
    files.push(artifact(BUILD_TRANSFORM_PATH, transformPath, "project_file"));
  }
  if (options.descriptor !== null) {
    const descriptorPath = join(dir, "sandbox-task.json");
    await writeFile(descriptorPath, options.descriptor, "utf8");
    const descriptor = artifact(DESCRIPTOR, descriptorPath, "project_file");
    if (options.descriptorFirst === true) files.unshift(descriptor);
    else files.push(descriptor);
  }
  return files;
}
const HARNESS = {
  harnessSha256: "h".repeat(64),
  toolchainDigest: "sha256:toolchain",
};
const TRANSFORM = {
  transform: {
    aliasRules: [
      { before: "Acme", after: "Shop", kind: "identifier", paths: [] },
    ],
    fromTransformConfigSha256: "f".repeat(64),
    transformConfigSha256: "t".repeat(64),
  },
};

// Extends "[happy-7] a ready build's recorded counts are its descriptor's":
// the descriptor listed first, entries with extra keys, another version and run.
test("[happy-7] a ready build records its descriptor's counts, without extra keys, under its own version and run", async () => {
  await inTemp(async (dir) => {
    const files = await handBuilt(dir, {
      ready: true,
      versionId: "sbv_9",
      descriptorFirst: true,
      descriptor: descriptorText([
        { label: "scenarios", count: 6, note: "x" },
        { label: "public", count: 0 },
        { label: "other", count: 11 },
      ]),
    });
    assert.deepEqual(await commitBuild(files, "arn_other"), [
      {
        versionId: "sbv_9",
        runId: "arn_other",
        output: {
          ...HARNESS,
          testSummary: [
            { label: "scenarios", count: 6 },
            { label: "public", count: 0 },
            { label: "other", count: 11 },
          ],
        },
      },
    ]);
  });
});

// A ready build with a transform records it as today, and the counts with it.
test("[happy-7] a ready build with a transform records harness, transform and counts together", async () => {
  await inTemp(async (dir) => {
    const files = await handBuilt(dir, {
      ready: true,
      transform: true,
      descriptor: descriptorText([{ label: "public", count: 3 }]),
    });
    assert.deepEqual(await commitBuild(files), [
      {
        versionId: "sbv_1",
        runId: "arn_build",
        output: {
          ...HARNESS,
          ...TRANSFORM,
          testSummary: [{ label: "public", count: 3 }],
        },
      },
    ]);
  });
});

// A ready build whose descriptor counts nothing records an empty list, not no key.
test("[happy-7] a ready build whose descriptor's summary is empty records testSummary []", async () => {
  await inTemp(async (dir) => {
    const files = await handBuilt(dir, {
      ready: true,
      descriptor: '{"testSummary":[]}',
    });
    const recorded = await commitBuild(files);
    assert.deepEqual(recorded, [
      {
        versionId: "sbv_1",
        runId: "arn_build",
        output: { ...HARNESS, testSummary: [] },
      },
    ]);
  });
});

// Extends "[unhappy-8] a build that is not ready records nothing, even beside
// a valid descriptor": the same files, ready, record the counts; not ready,
// with any descriptor or none, nothing.
test("[unhappy-8] a not-ready build records nothing whatever its descriptor, where the same build ready records its counts", async () => {
  await inTemp(async (dir) => {
    const text = descriptorText([{ label: "public", count: 2 }]);
    const ready = await handBuilt(dir, {
      ready: true,
      descriptor: text,
      transform: true,
    });
    assert.deepEqual(await commitBuild(ready), [
      {
        versionId: "sbv_1",
        runId: "arn_build",
        output: {
          ...HARNESS,
          ...TRANSFORM,
          testSummary: [{ label: "public", count: 2 }],
        },
      },
    ]);
    for (const descriptor of [text, '{"testSummary":[]}', "not json", null]) {
      const notReady = await handBuilt(dir, {
        ready: false,
        descriptor,
        transform: true,
      });
      assert.deepEqual(await commitBuild(notReady), []);
    }
  });
});

// Extends "[boundary-8] a ready build committed without its descriptor":
// descriptor entries that give no summary leave the key out, and the rest
// is what the same build records with its descriptor.
for (const [what, descriptor, change] of [
  ["a descriptor that is not JSON", "not json", null],
  ["a descriptor whose summary is not a list", '{"testSummary":"none"}', null],
  ["a descriptor with no summary", '{"title":"x"}', null],
  ["a descriptor entry whose file is missing", null, "missing"],
  ["a descriptor at project/sub/sandbox-task.json", null, "moved"],
] as const)
  test(`[boundary-8] a ready build with ${what} records no testSummary key, and otherwise what it records with its descriptor`, async () => {
    await inTemp(async (dir) => {
      const good = await handBuilt(dir, {
        ready: true,
        transform: true,
        descriptor: descriptorText([{ label: "public", count: 2 }]),
      });
      const whole = await commitBuild(good);
      assert.deepEqual(whole, [
        {
          versionId: "sbv_1",
          runId: "arn_build",
          output: {
            ...HARNESS,
            ...TRANSFORM,
            testSummary: [{ label: "public", count: 2 }],
          },
        },
      ]);
      const files =
        descriptor !== null
          ? await handBuilt(dir, {
              ready: true,
              transform: true,
              descriptor,
            })
          : good.map((file) =>
              file.path !== DESCRIPTOR
                ? file
                : change === "missing"
                  ? { ...file, absolutePath: join(dir, "missing.json") }
                  : { ...file, path: "project/sub/sandbox-task.json" },
            );
      const recorded = await commitBuild(files);
      assert.equal(recorded.length, 1);
      assert.equal("testSummary" in (recorded[0]?.output as object), false);
      assert.deepEqual(recorded, [
        {
          versionId: "sbv_1",
          runId: "arn_build",
          output: { ...HARNESS, ...TRANSFORM },
        },
      ]);
    });
  });

// A real ready build whose descriptor file is gone records the rest as with it.
test("[boundary-8] a real ready build whose descriptor file is missing records its harness and no testSummary key", async () => {
  const build = await readyBuild();
  try {
    assert.equal(build.manifest.ready, true);
    const descriptor = JSON.parse(await build.read(DESCRIPTOR)) as {
      testSummary: unknown;
    };
    const whole = await commitBuild(build.files);
    assert.equal(whole.length, 1);
    const withSummary = whole[0]?.output as Record<string, unknown>;
    assert.deepEqual(withSummary.testSummary, descriptor.testSummary);
    const { testSummary: _summary, ...rest } = withSummary;
    const recorded = await commitBuild(
      build.files.map((file) =>
        file.path === DESCRIPTOR
          ? { ...file, absolutePath: join(build.outDir, "gone.json") }
          : file,
      ),
    );
    assert.equal(recorded.length, 1);
    assert.equal("testSummary" in (recorded[0]?.output as object), false);
    assert.deepEqual(recorded, [
      { versionId: "sbv_1", runId: "arn_build", output: rest },
    ]);
  } finally {
    await build.done();
  }
});
