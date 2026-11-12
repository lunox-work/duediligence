import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { StoredVersionWithSource } from "@sandbox-factory/db";
import type {
  EvaluationCommand,
  EvaluationExecResult,
  EvaluationProvider,
  SandboxBuildManifest,
  StarterSubmission,
} from "sandbox-factory";
import type { AgentModel, AgentTurn } from "../src/agent/loop.js";
import type { ArtifactFile, ToolInputs } from "../src/tools/adapter.js";
import {
  STARTER_CHECKS_MAX,
  STARTER_RUNS_MAX,
  STEP_OUTPUT_CHARS,
  createStarterAdapter,
} from "../src/tools/starter.js";

const stamp = "2026-10-05T00:00:00.000Z";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const limits = { maxTurns: 60, maxTokens: 1_000_000 };

/** The cart starter, as in starter.test.ts. */
const starter: Omit<StarterSubmission, "summary"> = {
  files: [
    {
      path: "src/cart.ts",
      text: [
        "export interface AcmeLine { readonly price: number; readonly quantity: number }",
        "/** What the cart comes to. TODO: the bounty: sum each line's price times quantity. */",
        "export function acmeTotal(lines: readonly AcmeLine[]): number {",
        "  return lines.length === 0 ? 0 : Number.NaN;",
        "}",
        "",
      ].join("\n"),
    },
  ],
  publicTests: [
    {
      path: "tests/public/cart.test.ts",
      text: [
        'import assert from "node:assert/strict";',
        'import { test } from "node:test";',
        'import { acmeTotal } from "../../src/cart.js";',
        'test("an empty cart is free", () => assert.equal(acmeTotal([]), 0));',
        "",
      ].join("\n"),
    },
  ],
  hiddenTests: [
    {
      path: "tests/private/total.test.ts",
      text: [
        'import assert from "node:assert/strict";',
        'import { test } from "node:test";',
        'import { acmeTotal } from "../../src/cart.js";',
        'test("lines add up", () => assert.equal(acmeTotal([{ price: 2, quantity: 3 }]), 6));',
        "",
      ].join("\n"),
      expectedBaseline: "fail",
    },
  ],
  packages: [],
  scenario:
    'import { acmeTotal } from "../src/cart.js";\nconsole.log(acmeTotal([]));\n',
  aliases: [
    { before: "AcmeLine", after: "Line", kind: "identifier", paths: [] },
    { before: "acmeTotal", after: "total", kind: "identifier", paths: [] },
  ],
};
const submission: StarterSubmission = {
  ...starter,
  summary: "A cart whose total is left to write.",
};
const { aliases: pseudonyms, ...candidate } = starter;
const { aliases: _pseudonyms, ...submitted } = submission;
const renamedHiddenTests = submission.hiddenTests.map((test) => ({
  ...test,
  text: test.text.replaceAll("acmeTotal", "total"),
}));

const usage = {
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
let calls = 0;
const call = (name: string, input: unknown) => ({
  type: "tool_use",
  id: `${name}-${(calls += 1)}`,
  name,
  input,
});
const turn = (content: unknown[], stopReason = "tool_use"): AgentTurn => ({
  content: content as AgentTurn["content"],
  stopReason,
  usage,
});
const setPseudonyms = (aliases: unknown = pseudonyms) =>
  turn([call("set_pseudonyms", { aliases })]);
function scripted(turns: AgentTurn[]): AgentModel & {
  results: { content: string; is_error?: boolean }[][];
} {
  const results: { content: string; is_error?: boolean }[][] = [];
  return {
    model: "test-model",
    results,
    async turn(request) {
      const last = request.messages.at(-1);
      if (request.messages.length > 1 && Array.isArray(last?.content))
        results.push(
          last.content as unknown as { content: string; is_error?: boolean }[],
        );
      return turns.shift() ?? turn([], "refusal");
    },
  };
}

const TAP_FAILED = {
  exitCode: 1,
  stdout:
    "TAP version 13\nnot ok 1 - fails\n  failureType: 'testCodeFailure'\n1..1\n# tests 1\n# pass 0\n# fail 1\n",
};
function fakeProvider(
  script: (argv: readonly string[]) => Partial<EvaluationExecResult> = (
    argv,
  ) => (argv.some((arg) => arg.startsWith("tests/private/")) ? TAP_FAILED : {}),
) {
  let jobs = 0;
  const provider: EvaluationProvider = {
    name: "fake",
    async create() {
      jobs += 1;
      return {
        id: `job_${jobs}`,
        environment: {
          provider: "fake",
          environmentId: null,
          templateDigest: null,
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
  return { provider, jobs: () => jobs };
}

const stored: StoredVersionWithSource = {
  version: {
    id: "sbv_1",
    sandboxId: "sbx_1",
    version: 1,
    title: "Sum a cart",
    specSummary: "The cart adds up its lines.",
    complexity: "S",
    tags: [],
    testSummary: [],
    publicBaseCommitSha: null,
    readme: null,
    languages: null,
    frozenAt: null,
    createdAt: stamp,
  },
  source: {
    sandboxVersionId: "sbv_1",
    origin: "starter",
    sourceSnapshotId: null,
    sourceCommitSha: null,
    sliceRunId: null,
    manifestSha256: null,
    contractSha256: null,
    starterRunId: "arn_starter",
    starterSha256: null,
    transformConfigSha256: "t".repeat(64),
    approvedTaskSha256: "a".repeat(64),
    proposalVersion: 1,
    contextVersions: { jira: null, github: null },
    approvedTask: {
      schemaVersion: 3,
      title: "Sum a cart",
      summary: "The cart adds up its lines: price times quantity.",
      spec: null,
      pricing: null,
      selectedBy: "user_1",
      selectedAt: stamp,
      bountyId: "bty_1",
    },
    aliasRules: [],
    dependencyChoices: {},
    acceptanceTests: [],
    fixtures: null,
    scope: {
      editablePaths: [],
      generatedPaths: [],
      permittedOperations: ["edit", "add"],
      dependencies: [],
      blockers: [],
    },
    harnessSha256: null,
    toolchainDigest: null,
    buildRunId: "arn_starter",
    roundTripRunId: null,
    disclosureRunId: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  },
};
const params = {
  deadlineMinutes: 60,
  agent: "starter" as const,
  sandboxVersionId: "sbv_1",
  approvedTaskSha256: "a".repeat(64),
  stack: ["TypeScript"],
  vocabulary: ["acme"],
};
function inputs(recorded: unknown[] = []): ToolInputs {
  return {
    getRun: async () => null,
    listArtifacts: async () => [],
    readArtifact: async () => undefined,
    getVersion: async (id) => (id === "sbv_1" ? stored : null),
    getTask: async () => null,
    recordBuildOutput: async () => false,
    recordStarterOutput: async (versionId, runId, output) => {
      recorded.push({ versionId, runId, output });
      return true;
    },
  };
}

/**
 * A starter run whose agent never has a submission accepted: it reads and
 * writes nothing, so it is given fixed paths. Its log, its step lines and
 * the jobs it created are kept, and how it ended.
 */
async function playRefused(turns: AgentTurn[]) {
  const model = scripted(turns);
  const fake = fakeProvider();
  const adapter = createStarterAdapter({
    agent: { model, limits },
    provider: fake.provider,
    now: () => new Date(stamp),
  });
  const lines: string[] = [];
  const steps: string[] = [];
  let error: unknown = null;
  try {
    await adapter.run({
      sourceDir: "/touched-repos/starter-source",
      outDir: "/touched-repos/starter-source/out",
      params: params as never,
      run: null,
      inputs: inputs(),
      signal: new AbortController().signal,
      log: (line) => lines.push(line),
      step: (text) => steps.push(text),
    });
  } catch (caught) {
    error = caught;
  }
  return { model, fake, lines, steps, error };
}
/** The step lines of the starter tools' calls: "<verb> the starter: …". */
const starterSteps = (steps: readonly string[]) =>
  steps.filter((step) => step.includes(" the starter: "));
const refusals = (lines: readonly string[]) =>
  lines.filter((line) => line.includes("refused the starter"));

// --- step lines and run log lines of refused checks ---

test("[unhappy-3] check_starter before any pseudonyms are set stops at rules, in the step line and the log", async () => {
  const { model, steps, lines } = await playRefused([
    turn([call("check_starter", candidate)]),
  ]);
  const result = model.results[0]?.[0];
  assert.equal(result?.is_error, true);
  assert.match(result?.content ?? "", /needs a name table/);
  assert.deepEqual(starterSteps(steps), [
    "Checked the starter: it breaks the starter's rules",
  ]);
  assert.ok(
    lines.some((line) =>
      line.startsWith(
        "check_starter refused the starter at the rules stage (1 problem(s)).\nA starter needs a name table",
      ),
    ),
    lines.join("\n---\n"),
  );
});

test("[unhappy-3] once pseudonyms are set, a check that passes gets its usual step line and no refusal log", async () => {
  const { steps, lines } = await playRefused([
    turn([call("check_starter", candidate)]),
    setPseudonyms(),
    turn([call("check_starter", candidate)]),
  ]);
  assert.deepEqual(starterSteps(steps), [
    "Checked the starter: it breaks the starter's rules",
    "Checked the starter: 3 files compile",
  ]);
  assert.equal(refusals(lines).length, 1);
  assert.match(
    refusals(lines)[0] ?? "",
    /^check_starter refused .* rules stage/,
  );
});

// The spec's lib/cart.ts fails the tool's input schema, which says source
// files live under src/, before any check runs; a source file given twice
// passes the schema and breaks the rules.
const twiceFiles = [...candidate.files, ...candidate.files];

test("[unhappy-4] check_starter refused for a source file given twice names the rules stage", async () => {
  const { steps, lines, fake } = await playRefused([
    setPseudonyms(),
    turn([call("check_starter", { ...candidate, files: twiceFiles })]),
  ]);
  assert.deepEqual(starterSteps(steps), [
    "Checked the starter: it breaks the starter's rules",
  ]);
  const logged = refusals(lines);
  assert.equal(logged.length, 1);
  assert.ok(
    logged[0]?.startsWith(
      "check_starter refused the starter at the rules stage",
    ),
    logged.join("\n---\n"),
  );
  assert.equal(fake.jobs(), 0);
});

test("[unhappy-4] run_starter refused for an unresolved scenario import names the project stage and starts no job", async () => {
  const { steps, lines, fake } = await playRefused([
    setPseudonyms(),
    turn([
      call("run_starter", {
        ...candidate,
        scenario: 'import "../src/missing.js";\n',
      }),
    ]),
  ]);
  assert.deepEqual(starterSteps(steps), [
    "Ran the starter: its project is refused",
  ]);
  const logged = refusals(lines);
  assert.equal(logged.length, 1);
  assert.ok(
    logged[0]?.startsWith(
      "run_starter refused the starter at the project stage",
    ),
    logged.join("\n---\n"),
  );
  assert.equal(fake.jobs(), 0);
});

test("[unhappy-4] submit_starter refused for a type error names the types stage and starts no job", async () => {
  const { steps, lines, fake } = await playRefused([
    setPseudonyms(),
    turn([
      call("submit_starter", {
        ...submitted,
        files: [
          ...submission.files,
          { path: "src/a.ts", text: "export const a: number = 'x';" },
        ],
      }),
    ]),
  ]);
  assert.deepEqual(starterSteps(steps), [
    "Submitted the starter: it does not compile yet",
  ]);
  const logged = refusals(lines);
  assert.equal(logged.length, 1);
  assert.ok(
    logged[0]?.startsWith(
      "submit_starter refused the starter at the types stage",
    ),
    logged.join("\n---\n"),
  );
  assert.equal(fake.jobs(), 0);
});

const globex = [
  { before: "Globex", after: "Vendor", kind: "identifier" },
] as const;
const NAMES_PROBLEM =
  "Name 1: Globex does not occur in the starter, so it renames nothing.";

test("[unhappy-5] check_starter with pseudonyms that rename nothing stops at names", async () => {
  const { steps, lines } = await playRefused([
    setPseudonyms(globex),
    turn([call("check_starter", candidate)]),
  ]);
  assert.deepEqual(starterSteps(steps), [
    "Checked the starter: its pseudonyms do not apply",
  ]);
  assert.ok(
    lines.includes(
      `check_starter refused the starter at the names stage (1 problem(s)).\n${NAMES_PROBLEM}`,
    ),
    lines.join("\n---\n"),
  );
});

test("[unhappy-5] run_starter with pseudonyms that rename nothing logs the names stage under its own name", async () => {
  const { steps, lines, fake } = await playRefused([
    setPseudonyms(globex),
    turn([call("run_starter", candidate)]),
  ]);
  assert.deepEqual(starterSteps(steps), [
    "Ran the starter: its pseudonyms do not apply",
  ]);
  assert.deepEqual(refusals(lines), [
    `run_starter refused the starter at the names stage (1 problem(s)).\n${NAMES_PROBLEM}`,
  ]);
  assert.equal(fake.jobs(), 0);
});

const sumHidden = {
  ...candidate,
  hiddenTests: candidate.hiddenTests.map((hidden) => ({
    ...hidden,
    text: hidden.text.replaceAll("acmeTotal", "sum"),
  })),
};

test("[unhappy-6] a hidden test that does not compile is shown to the agent but only counted in the log", async () => {
  const { model, lines } = await playRefused([
    setPseudonyms(),
    turn([call("check_starter", sumHidden)]),
  ]);
  const result = model.results[1]?.[0];
  assert.equal(result?.is_error, true);
  assert.ok(
    (result?.content ?? "")
      .split("\n")
      .some((problem) => problem.startsWith("tests/private/total.test.ts:")),
    result?.content ?? "",
  );
  const logged = refusals(lines);
  assert.equal(logged.length, 1);
  assert.ok(
    logged[0]?.endsWith("problem(s) in hidden tests, not shown."),
    logged.join("\n---\n"),
  );
  assert.equal(
    lines.some((line) => line.includes("tests/private/total.test.ts:")),
    false,
  );
});

test("[unhappy-6] a submission whose hidden test does not compile logs its types refusal with the hidden count", async () => {
  const { model, lines, fake } = await playRefused([
    setPseudonyms(),
    turn([
      call("submit_starter", { ...sumHidden, summary: submitted.summary }),
    ]),
  ]);
  const shown = (model.results[1]?.[0]?.content ?? "").split("\n");
  const hidden = shown.filter((problem) => problem.includes("tests/private/"));
  assert.ok(hidden.length > 0, shown.join("\n"));
  const logged = refusals(lines);
  assert.equal(logged.length, 1);
  assert.ok(
    logged[0]?.startsWith(
      `submit_starter refused the starter at the types stage (${shown.length} problem(s)).`,
    ),
    logged.join("\n---\n"),
  );
  assert.ok(
    logged[0]?.endsWith(
      `\n${hidden.length} problem(s) in hidden tests, not shown.`,
    ),
    logged.join("\n---\n"),
  );
  assert.equal(
    lines.some((line) => line.includes("tests/private/total.test.ts:")),
    false,
  );
  assert.equal(fake.jobs(), 0);
});

test("[boundary-5] a schema-invalid check_starter call gets no step line and no refusal log", async () => {
  const { model, steps, lines } = await playRefused([
    setPseudonyms(),
    turn([call("check_starter", { ...candidate, packages: "none" })]),
  ]);
  assert.equal(model.results[1]?.[0]?.is_error, true);
  assert.deepEqual(starterSteps(steps), []);
  assert.deepEqual(refusals(lines), []);
});

test("[boundary-5] the check_starter call after the limit gets no step line and no refusal log", async () => {
  const { model, steps, lines } = await playRefused([
    setPseudonyms(),
    turn([call("check_starter", { ...candidate, packages: "none" })]),
    ...Array.from({ length: STARTER_CHECKS_MAX + 1 }, () =>
      turn([call("check_starter", candidate)]),
    ),
  ]);
  assert.match(
    model.results[STARTER_CHECKS_MAX + 2]?.[0]?.content ?? "",
    /No checks are left/,
  );
  assert.deepEqual(
    starterSteps(steps),
    Array.from(
      { length: STARTER_CHECKS_MAX },
      () => "Checked the starter: 3 files compile",
    ),
  );
  assert.deepEqual(refusals(lines), []);
});

const misplacedCall = () =>
  call("check_starter", { ...candidate, files: twiceFiles });
// Under the cart's pseudonyms, AcmeLine must still occur for the check to
// get past names, so the type error is added beside src/cart.ts.
const mistypedCall = () =>
  call("check_starter", {
    ...candidate,
    files: [
      ...candidate.files,
      { path: "src/a.ts", text: "export const a: number = 'no';\n" },
    ],
  });

test("[concurrency-1] two checks in one turn each name their own stage, in call order", async () => {
  const { model, steps, lines } = await playRefused([
    setPseudonyms(),
    turn([misplacedCall(), mistypedCall()]),
  ]);
  assert.equal(model.results[1]?.[0]?.content, "src/cart.ts is given twice.");
  assert.match(model.results[1]?.[1]?.content ?? "", /TS2322/);
  assert.deepEqual(starterSteps(steps), [
    "Checked the starter: it breaks the starter's rules",
    "Checked the starter: it does not compile yet",
  ]);
  const logged = refusals(lines);
  assert.equal(logged.length, 2);
  assert.ok(
    logged[0]?.startsWith(
      "check_starter refused the starter at the rules stage",
    ),
  );
  assert.ok(
    logged[1]?.startsWith(
      "check_starter refused the starter at the types stage",
    ),
  );
});

test("[concurrency-1] the same two checks in the other order are logged and described in that order", async () => {
  const { steps, lines } = await playRefused([
    setPseudonyms(),
    turn([mistypedCall(), misplacedCall()]),
  ]);
  assert.deepEqual(starterSteps(steps), [
    "Checked the starter: it does not compile yet",
    "Checked the starter: it breaks the starter's rules",
  ]);
  const logged = refusals(lines);
  assert.equal(logged.length, 2);
  assert.ok(
    logged[0]?.startsWith(
      "check_starter refused the starter at the types stage",
    ),
  );
  assert.ok(
    logged[1]?.startsWith(
      "check_starter refused the starter at the rules stage",
    ),
  );
});

// --- what a committed starter run records ---

/** A full starter run in a temporary directory, removed by `done`. */
async function playSubmitted(
  turns: AgentTurn[],
  provider: EvaluationProvider = fakeProvider().provider,
) {
  const model = scripted(turns);
  const adapter = createStarterAdapter({
    agent: { model, limits },
    provider,
    now: () => new Date(stamp),
  });
  const out = await mkdtemp(join(tmpdir(), "touched-repos-starter-"));
  const files = await adapter.run({
    sourceDir: out,
    outDir: join(out, "out"),
    params: params as never,
    run: null,
    inputs: inputs(),
    signal: new AbortController().signal,
    log: () => {},
  });
  const read = async (path: string) => {
    const file = files.find((item) => item.path === path);
    return file === undefined ? null : readFile(file.absolutePath, "utf8");
  };
  const commit = async (committedFiles: ArtifactFile[] = files) => {
    const recorded: { versionId: string; runId: string; output: unknown }[] =
      [];
    await adapter.committed?.({
      runId: "arn_starter",
      files: committedFiles,
      inputs: inputs(recorded),
    });
    return recorded;
  };
  return {
    out,
    files,
    read,
    commit,
    done: () => rm(out, { recursive: true, force: true }),
  };
}
const acceptedTurns = () => [
  setPseudonyms(),
  turn([call("check_starter", candidate)]),
  turn([call("run_starter", candidate)]),
  turn([call("submit_starter", submitted)]),
];
/** What a committed starter records today, before the summary. */
async function outputToday(read: (path: string) => Promise<string | null>) {
  const setText = (await read("starter-set.json")) ?? "";
  const manifest = JSON.parse(
    (await read("build-manifest.json")) ?? "",
  ) as SandboxBuildManifest;
  return {
    starterSha256: sha(setText),
    aliasRules: submission.aliases,
    acceptanceTests: renamedHiddenTests,
    scope: {
      editablePaths: ["src/cart.ts"],
      generatedPaths: [],
      permittedOperations: ["edit", "add"],
      dependencies: [],
      blockers: [],
    },
    transformConfigSha256: manifest.transformConfigSha256,
    build: manifest.ready
      ? {
          harnessSha256: manifest.harnessSha256,
          toolchainDigest: manifest.toolchainDigest,
        }
      : null,
  };
}
const CART_SUMMARY = [
  { label: "public", count: 1 },
  { label: "scenarios", count: 0 },
];

test("[happy-5] a committed starter run records its descriptor's counts beside what it records today", async () => {
  const run = await playSubmitted(acceptedTurns());
  try {
    const today = await outputToday(run.read);
    assert.notEqual(today.build, null);
    const recorded = await run.commit();
    assert.deepEqual(recorded, [
      {
        versionId: "sbv_1",
        runId: "arn_starter",
        output: { ...today, testSummary: CART_SUMMARY },
      },
    ]);
  } finally {
    await run.done();
  }
});

test("[happy-5] the recorded counts are the testSummary of the run's own descriptor, outside build", async () => {
  const run = await playSubmitted(acceptedTurns());
  try {
    const descriptor = JSON.parse(
      (await run.read("project/sandbox-task.json")) ?? "",
    ) as { testSummary: unknown };
    const recorded = await run.commit();
    assert.equal(recorded.length, 1);
    const output = recorded[0]?.output as {
      testSummary?: unknown;
      build: Record<string, unknown> | null;
    };
    assert.deepEqual(output.testSummary, descriptor.testSummary);
    assert.equal("testSummary" in (output.build ?? {}), false);
  } finally {
    await run.done();
  }
});

/** Hidden tests that pass on the starter, which they were said not to: the baseline fails. */
const failingBaseline = () =>
  fakeProvider((argv) =>
    argv.some((arg) => arg.startsWith("tests/private/"))
      ? { exitCode: 0, stdout: `ok ${"x".repeat(STEP_OUTPUT_CHARS + 10)}` }
      : argv.includes("sandbox/run.js")
        ? { exitCode: 1, stderr: "TypeError: boom" }
        : {},
  ).provider;
const spentTurns = () => [
  setPseudonyms(),
  ...Array.from({ length: STARTER_RUNS_MAX }, () =>
    turn([call("submit_starter", submitted)]),
  ),
];

test("[happy-6] a starter kept as not ready still records its counts, with build null", async () => {
  const run = await playSubmitted(spentTurns(), failingBaseline());
  try {
    const descriptor = JSON.parse(
      (await run.read("project/sandbox-task.json")) ?? "",
    ) as { testSummary: unknown };
    assert.deepEqual(descriptor.testSummary, CART_SUMMARY);
    const recorded = await run.commit();
    assert.equal(recorded.length, 1);
    const output = recorded[0]?.output as {
      build: unknown;
      testSummary?: unknown;
    };
    assert.equal(output.build, null);
    assert.deepEqual(output.testSummary, CART_SUMMARY);
  } finally {
    await run.done();
  }
});

test("[happy-6] a not-ready starter's output is today's with the counts added", async () => {
  const run = await playSubmitted(spentTurns(), failingBaseline());
  try {
    const today = await outputToday(run.read);
    assert.equal(today.build, null);
    const recorded = await run.commit();
    assert.deepEqual(recorded, [
      {
        versionId: "sbv_1",
        runId: "arn_starter",
        output: { ...today, testSummary: CART_SUMMARY },
      },
    ]);
  } finally {
    await run.done();
  }
});

test("[boundary-8] a starter committed without its descriptor records today's output with no testSummary key", async () => {
  const run = await playSubmitted(acceptedTurns());
  try {
    const today = await outputToday(run.read);
    const recorded = await run.commit(
      run.files.filter((file) => file.path !== "project/sandbox-task.json"),
    );
    assert.equal(recorded.length, 1);
    const output = recorded[0]?.output as Record<string, unknown>;
    assert.equal("testSummary" in output, false);
    assert.deepEqual(recorded, [
      { versionId: "sbv_1", runId: "arn_starter", output: today },
    ]);
  } finally {
    await run.done();
  }
});

test("[boundary-8] a starter whose descriptor has no valid testSummary records no testSummary key", async () => {
  const run = await playSubmitted(acceptedTurns());
  try {
    const today = await outputToday(run.read);
    const broken = join(run.out, "broken-descriptor.json");
    await writeFile(broken, '{"testSummary":{"public":1}}', "utf8");
    const recorded = await run.commit(
      run.files.map((file) =>
        file.path === "project/sandbox-task.json"
          ? { ...file, absolutePath: broken }
          : file,
      ),
    );
    assert.equal(recorded.length, 1);
    const output = recorded[0]?.output as Record<string, unknown>;
    assert.equal("testSummary" in output, false);
    assert.deepEqual(output, today);
  } finally {
    await run.done();
  }
});
