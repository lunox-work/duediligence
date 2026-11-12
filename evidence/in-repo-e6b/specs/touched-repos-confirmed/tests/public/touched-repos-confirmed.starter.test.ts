import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { StoredVersionWithSource } from "@sandbox-factory/db";
import { starterProblems } from "sandbox-factory";
import type {
  EvaluationCommand,
  EvaluationExecResult,
  EvaluationProvider,
  SandboxBuildManifest,
  StarterSubmission,
} from "sandbox-factory";
import type { AgentModel, AgentTurn } from "../src/agent/loop.js";
import { AnalysisError } from "../src/errors.js";
import type { ToolInputs } from "../src/tools/adapter.js";
import { checkStarter } from "../src/tools/starter-check.js";
import {
  STARTER_CHECKS_MAX,
  STARTER_RUNS_MAX,
  createStarterAdapter,
  refusedCheckLog,
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
const renamedHiddenTests = submission.hiddenTests.map((item) => ({
  ...item,
  text: item.text.replaceAll("acmeTotal", "total"),
}));
const projectVersion = {
  sandboxId: "sbx_1",
  versionId: "sbv_1",
  version: 1,
  title: "Sum a cart",
  specSummary: "The cart adds up its lines.",
  complexity: "S",
  tags: [],
};
/** The cart starter's aliases, one at a time. */
const [lineAlias, totalAlias] = submission.aliases as [
  StarterSubmission["aliases"][number],
  StarterSubmission["aliases"][number],
];
const brokenCart = {
  path: "src/cart.ts",
  text: "export const acmeTotal: number = 'no';\n",
};
const missingImport = 'import "../src/missing.js";\n';

/** checkStarter on the cart starter changed by `change`; nothing is read from root. */
function check(
  change: Partial<StarterSubmission> = {},
  vocabulary: readonly string[] = ["acme"],
) {
  return checkStarter({
    root: join(tmpdir(), "touched-repos-confirmed-root"),
    version: projectVersion,
    starter: { ...submission, ...change },
    spec: null,
    vocabulary,
  });
}

// --- checkStarter: the stage of a refused check ---

test("[happy-1] a starter that passes every stage is ok with no problems and no stage key", () => {
  const result = check();
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
  assert.equal("stage" in result, false);
});

test("[unhappy-1] a starter with no name table is refused at the rules stage", () => {
  const result = check({ aliases: [] });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.stage, "rules");
  assert.match(result.problems[0] ?? "", /needs a name table/);
});

test("[unhappy-1] a source file outside src/ is refused at the rules stage, before the project is generated", () => {
  const result = check({
    files: [{ path: "lib/cart.ts", text: "" }],
    scenario: missingImport,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.stage, "rules");
  assert.deepEqual(result.problems, [
    "lib/cart.ts: source files live under src/.",
  ]);
});

test("[unhappy-1] a name that renames nothing is refused at the names stage", () => {
  const result = check({
    aliases: [
      { before: "Globex", after: "Vendor", kind: "identifier", paths: [] },
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.stage, "names");
  assert.deepEqual(result.problems, [
    "Name 1: Globex does not occur in the starter, so it renames nothing.",
  ]);
});

test("[unhappy-1] a project blocker with a workspace leak is refused at the project stage, blockers then leaks", () => {
  const result = check({ aliases: [lineAlias], scenario: missingImport });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.stage, "project");
  assert.deepEqual(result.problems, [
    "sandbox/run.ts: ../src/missing.js does not resolve to a file in the project.",
    'src/cart.ts: "acme" names the workspace and appears 3 times in 2 public files: src/cart.ts, tests/public/cart.test.ts. Give it a pseudonym.',
  ]);
});

test("[unhappy-1] a starter that does not type-check is refused at the types stage", () => {
  const result = check({ files: [brokenCart], aliases: [totalAlias] });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.stage, "types");
  assert.ok(
    result.problems.some((problem) =>
      problem.startsWith("src/cart.ts:1 TS2322"),
    ),
    result.problems.join("\n"),
  );
});

test("[unhappy-2] a workspace name left in a public file, with no other project problem, stops at names", () => {
  const result = check({ aliases: [lineAlias] }, ["acme"]);
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.stage, "names");
  assert.ok(result.problems.length > 0);
  for (const problem of result.problems) {
    assert.match(problem, /"acme" names the workspace/);
    assert.doesNotMatch(problem, /^\S+:\d+ TS\d+ /);
  }
});

test("[boundary-1] a stage's problems are still capped at 40, the first the rules give in their order", () => {
  const files = [
    ...submission.files,
    ...Array.from({ length: 45 }, (_, index) => ({
      path: `lib/a${index + 1}.ts`,
      text: "",
    })),
  ];
  const result = check({ files });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.stage, "rules");
  assert.equal(result.problems.length, 40);
  assert.deepEqual(
    result.problems,
    starterProblems({ ...submission, files }).slice(0, 40),
  );
});

// --- refusedCheckLog ---

test("[happy-2] a rules refusal with one problem logs a header and the problem", () => {
  assert.equal(
    refusedCheckLog("check_starter", "rules", [
      "lib/cart.ts: source files live under src/.",
    ]),
    "check_starter refused (rules): 1 problem.\n  lib/cart.ts: source files live under src/.",
  );
});

test("[happy-3] a hidden test's problem is counted in the header and the last line, but not shown", () => {
  assert.equal(
    refusedCheckLog("submit_starter", "types", [
      "src/cart.ts:1 TS2322 Type 'string' is not assignable to type 'number'.",
      "tests/private/total.test.ts:3 TS2305 Module '\"../../src/cart.js\"' has no exported member 'sum'.",
      "(project) TS5023 Unknown compiler option 'x'.",
    ]),
    [
      "submit_starter refused (types): 3 problems.",
      "  src/cart.ts:1 TS2322 Type 'string' is not assignable to type 'number'.",
      "  (project) TS5023 Unknown compiler option 'x'.",
      "  and 1 in hidden tests, not shown",
    ].join("\n"),
  );
});

test("[boundary-2] a problem is a hidden test's only when it starts with tests/private/", () => {
  const hidden = "tests/private/total.test.ts is longer than 20000 characters.";
  assert.equal(
    refusedCheckLog("run_starter", "rules", [hidden]),
    "run_starter refused (rules): 1 problem.\n  and 1 in hidden tests, not shown",
  );
  for (const shown of [
    "lib/x.test.ts: hidden tests live under tests/private/ and end in .test.ts.",
    "src/a.ts and tests/private/A.ts differ only in case.",
    "At least one hidden test must fail on the starter: it is how a finished bounty is told apart from an unfinished one.",
    "tests/public/cart.test.ts is given twice.",
  ])
    assert.equal(
      refusedCheckLog("run_starter", "rules", [shown]),
      `run_starter refused (rules): 1 problem.\n  ${shown}`,
      shown,
    );
});

test("[boundary-3] when every problem is a hidden test's, only the header and the hidden count are logged", () => {
  assert.equal(
    refusedCheckLog("check_starter", "types", [
      "tests/private/a.test.ts:1 TS2304 Cannot find name 'x'.",
      "tests/private/b.test.ts:2 TS2304 Cannot find name 'y'.",
    ]),
    "check_starter refused (types): 2 problems.\n  and 2 in hidden tests, not shown",
  );
});

test("[boundary-4] no problems gives the header alone, in the plural", () => {
  assert.equal(
    refusedCheckLog("check_starter", "names", []),
    "check_starter refused (names): 0 problems.",
  );
});

test("[boundary-5] a problem of 300 characters is shown whole, and one of 301 is cut after 300 with an ellipsis", () => {
  const at300 = refusedCheckLog("check_starter", "rules", ["a".repeat(300)]);
  assert.equal(at300.split("\n")[1], `  ${"a".repeat(300)}`);
  assert.equal(at300.split("\n").length, 2);
  const at301 = refusedCheckLog("check_starter", "rules", ["a".repeat(301)]);
  assert.equal(at301.split("\n")[1], `  ${"a".repeat(300)}…`);
  assert.equal(at301.split("\n").length, 2);
});

test("[boundary-6] at most 10 problems are shown, then how many more, then the hidden count", () => {
  assert.equal(
    refusedCheckLog("check_starter", "rules", [
      ...Array.from({ length: 12 }, (_, index) => `p${index + 1}`),
      "tests/private/a.test.ts: x",
    ]),
    [
      "check_starter refused (rules): 13 problems.",
      ...Array.from({ length: 10 }, (_, index) => `  p${index + 1}`),
      "  and 2 more",
      "  and 1 in hidden tests, not shown",
    ].join("\n"),
  );
});

// --- The starter tools: step lines and the run log ---

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
        async exec(_command: EvaluationCommand) {
          return {
            exitCode: 0,
            timedOut: false,
            outputTruncated: false,
            stdout: "",
            stderr: "",
            durationMs: 1,
            ...script(_command.argv),
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
const isCode = (code: string) => (error: unknown) =>
  error instanceof AnalysisError && error.code === code;

/** A step line or log line, with the index of the agent turn it came in. */
interface Tagged {
  readonly turn: number;
  readonly text: string;
}

/**
 * A starter run whose agent makes the given turns and never has a
 * submission accepted: the run ends `agent_incomplete`, and its step and
 * log lines are kept, each tagged with its turn.
 */
async function refusedRun(turns: AgentTurn[]) {
  const fake = fakeProvider();
  const model = scripted(turns);
  const steps: Tagged[] = [];
  const lines: Tagged[] = [];
  const adapter = createStarterAdapter({
    agent: { model, limits },
    provider: fake.provider,
    now: () => new Date(stamp),
  });
  const out = await mkdtemp(join(tmpdir(), "touched-starter-"));
  try {
    await assert.rejects(
      adapter.run({
        sourceDir: out,
        outDir: join(out, "out"),
        params: params as never,
        run: null,
        inputs: inputs(),
        signal: new AbortController().signal,
        log: (text) => lines.push({ turn: model.results.length, text }),
        step: (text) => steps.push({ turn: model.results.length, text }),
      }),
      isCode("agent_incomplete"),
    );
  } finally {
    await rm(out, { recursive: true, force: true });
  }
  const at = (list: Tagged[], index: number) =>
    list.filter((item) => item.turn === index).map((item) => item.text);
  return {
    model,
    jobs: fake.jobs,
    stepsAt: (index: number) => at(steps, index),
    linesAt: (index: number) => at(lines, index),
    lines: lines.map((item) => item.text),
  };
}
const refusals = (lines: readonly string[]) =>
  lines.filter((line) => line.includes(" refused ("));

test("[unhappy-3] check_starter before any pseudonyms are set stops at rules, in its step line and the log", async () => {
  const run = await refusedRun([turn([call("check_starter", candidate)])]);
  const result = run.model.results[0]?.[0];
  assert.equal(result?.is_error, true);
  assert.match(result?.content ?? "", /needs a name table/);
  assert.deepEqual(run.stepsAt(0), [
    "Checked the starter: its files break the starter's rules",
  ]);
  assert.ok(
    run.lines.some((line) =>
      line.startsWith(
        "check_starter refused (rules): 1 problem.\n  A starter needs a name table",
      ),
    ),
    run.lines.join("\n---\n"),
  );
});

test("[unhappy-4] a check_starter refused at rules says so in its step line and log, and starts no job", async () => {
  const run = await refusedRun([
    setPseudonyms(),
    turn([
      call("check_starter", {
        ...candidate,
        files: [{ path: "lib/cart.ts", text: "" }],
      }),
    ]),
  ]);
  assert.deepEqual(run.stepsAt(1), [
    "Checked the starter: its files break the starter's rules",
  ]);
  const logged = refusals(run.linesAt(1));
  assert.equal(logged.length, 1);
  assert.ok(logged[0]?.startsWith("check_starter refused (rules):"));
  assert.equal(run.jobs(), 0);
});

test("[unhappy-4] a run_starter refused at project says so in its step line and log, and starts no job", async () => {
  const run = await refusedRun([
    setPseudonyms(),
    turn([call("run_starter", { ...candidate, scenario: missingImport })]),
  ]);
  assert.deepEqual(run.stepsAt(1), [
    "Ran the starter: its project does not generate yet",
  ]);
  const logged = refusals(run.linesAt(1));
  assert.equal(logged.length, 1);
  assert.ok(logged[0]?.startsWith("run_starter refused (project):"));
  assert.equal(run.jobs(), 0);
});

test("[unhappy-4] a submit_starter refused at types says so in its step line and log, and starts no job", async () => {
  const run = await refusedRun([
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
  assert.deepEqual(run.stepsAt(1), [
    "Submitted the starter: it does not compile yet",
  ]);
  const logged = refusals(run.linesAt(1));
  assert.equal(logged.length, 1);
  assert.ok(logged[0]?.startsWith("submit_starter refused (types):"));
  assert.equal(run.jobs(), 0);
});

test("[unhappy-5] pseudonyms that rename nothing stop check_starter at names", async () => {
  const run = await refusedRun([
    setPseudonyms([
      { before: "Globex", after: "Vendor", kind: "identifier", paths: [] },
    ]),
    turn([call("check_starter", candidate)]),
  ]);
  assert.deepEqual(run.stepsAt(1), [
    "Checked the starter: its names need fixing",
  ]);
  assert.ok(
    run.lines.includes(
      "check_starter refused (names): 1 problem.\n  Name 1: Globex does not occur in the starter, so it renames nothing.",
    ),
    run.lines.join("\n---\n"),
  );
});

test("[unhappy-6] a hidden test that does not compile is shown to the agent but only counted in the log", async () => {
  const hiddenTest = starter
    .hiddenTests[0] as StarterSubmission["hiddenTests"][number];
  const run = await refusedRun([
    setPseudonyms(),
    turn([
      call("check_starter", {
        ...candidate,
        hiddenTests: [
          {
            ...hiddenTest,
            text: [
              'import assert from "node:assert/strict";',
              'import { test } from "node:test";',
              'import { sum } from "../../src/cart.js";',
              'test("lines add up", () => assert.equal(sum([{ price: 2, quantity: 3 }]), 6));',
              "",
            ].join("\n"),
          },
        ],
      }),
    ]),
  ]);
  const result = run.model.results[1]?.[0];
  assert.equal(result?.is_error, true);
  assert.ok(
    (result?.content ?? "")
      .split("\n")
      .some((problem) => problem.startsWith("tests/private/total.test.ts:")),
    result?.content,
  );
  const logged = refusals(run.linesAt(1));
  assert.equal(logged.length, 1);
  assert.ok(logged[0]?.endsWith("in hidden tests, not shown"), logged[0] ?? "");
  assert.ok(
    run.lines.every((line) => !line.includes("tests/private/total.test.ts:")),
  );
});

test("[boundary-7] a schema-invalid check and a check after the limit never reach the check and write no log", async () => {
  const run = await refusedRun([
    setPseudonyms(),
    turn([call("check_starter", { ...candidate, packages: "none" })]),
    ...Array.from({ length: STARTER_CHECKS_MAX + 1 }, () =>
      turn([call("check_starter", candidate)]),
    ),
  ]);
  const over = STARTER_CHECKS_MAX + 2;
  assert.match(
    run.model.results[over]?.[0]?.content ?? "",
    /No checks are left/,
  );
  assert.deepEqual(run.stepsAt(1), ["Checked the starter: it was refused"]);
  assert.deepEqual(run.stepsAt(over), []);
  assert.deepEqual(refusals(run.linesAt(1)), []);
  assert.deepEqual(refusals(run.linesAt(over)), []);
});

test("[boundary-8] a schema-invalid run_starter keeps its old step line and writes no log", async () => {
  const run = await refusedRun([
    setPseudonyms(),
    turn([call("run_starter", { ...candidate, packages: "none" })]),
  ]);
  assert.equal(run.model.results[1]?.[0]?.is_error, true);
  assert.deepEqual(run.stepsAt(1), ["Ran the starter: it does not build yet"]);
  assert.deepEqual(refusals(run.linesAt(1)), []);
});

test("[concurrency-1] two checks in one turn each name their own stage, in call order", async () => {
  const run = await refusedRun([
    setPseudonyms(),
    turn([
      call("check_starter", {
        ...candidate,
        files: [{ path: "lib/cart.ts", text: "" }],
      }),
      // The spec's own types change under the cart's aliases (see the
      // submit_starter row of [unhappy-4]): replacing src/cart.ts would drop
      // AcmeLine, and the check would stop at names instead.
      call("check_starter", {
        ...candidate,
        files: [
          ...submission.files,
          { path: "src/a.ts", text: "export const a: number = 'x';" },
        ],
      }),
    ]),
  ]);
  assert.deepEqual(run.stepsAt(1), [
    "Checked the starter: its files break the starter's rules",
    "Checked the starter: it does not compile yet",
  ]);
  const logged = refusals(run.linesAt(1));
  assert.equal(logged.length, 2);
  assert.ok(
    logged[0]?.startsWith("check_starter refused (rules):"),
    logged[0] ?? "",
  );
  assert.ok(
    logged[1]?.startsWith("check_starter refused (types):"),
    logged[1] ?? "",
  );
});

// --- A starter's committed records the descriptor's counts ---

const cartSummary = [
  { label: "public", count: 1 },
  { label: "scenarios", count: 0 },
];

/** A starter run that ends with a submission, and the files it returned. */
async function submittedRun(turns: AgentTurn[], provider = fakeProvider()) {
  const model = scripted(turns);
  const adapter = createStarterAdapter({
    agent: { model, limits },
    provider: provider.provider,
    now: () => new Date(stamp),
  });
  const out = await mkdtemp(join(tmpdir(), "touched-starter-"));
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
    return file === undefined ? "" : readFile(file.absolutePath, "utf8");
  };
  return { adapter, files, out, read };
}

test("[happy-5] a starter run records its descriptor's counts on commit, beside what it records today", async () => {
  const run = await submittedRun([
    setPseudonyms(),
    turn([call("check_starter", candidate)]),
    turn([call("run_starter", candidate)]),
    turn([call("submit_starter", submitted)]),
  ]);
  try {
    const setText = await run.read("starter-set.json");
    const manifest = JSON.parse(
      await run.read("build-manifest.json"),
    ) as SandboxBuildManifest;
    assert.equal(manifest.ready, true);
    const recorded: unknown[] = [];
    await run.adapter.committed?.({
      runId: "arn_starter",
      files: run.files,
      inputs: inputs(recorded),
    });
    assert.deepEqual(recorded, [
      {
        versionId: "sbv_1",
        runId: "arn_starter",
        output: {
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
          build: {
            harnessSha256: manifest.harnessSha256,
            toolchainDigest: manifest.toolchainDigest,
          },
          testSummary: cartSummary,
        },
      },
    ]);
  } finally {
    await rm(run.out, { recursive: true, force: true });
  }
});

test("[happy-6] a starter kept as not ready still records its counts, outside build", async () => {
  // The hidden test passes on the starter, which it was said not to.
  const run = await submittedRun(
    [
      setPseudonyms(),
      ...Array.from({ length: STARTER_RUNS_MAX }, () =>
        turn([call("submit_starter", submitted)]),
      ),
    ],
    fakeProvider(() => ({})),
  );
  try {
    const manifest = JSON.parse(
      await run.read("build-manifest.json"),
    ) as SandboxBuildManifest;
    assert.equal(manifest.ready, false);
    const recorded: { output: Record<string, unknown> }[] = [];
    await run.adapter.committed?.({
      runId: "arn_starter",
      files: run.files,
      inputs: inputs(recorded),
    });
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]?.output.build, null);
    assert.deepEqual(recorded[0]?.output.testSummary, cartSummary);
  } finally {
    await rm(run.out, { recursive: true, force: true });
  }
});

test("[boundary-11] a starter committed without its descriptor leaves the testSummary key out, the rest unchanged", async () => {
  const run = await submittedRun([
    setPseudonyms(),
    turn([call("submit_starter", submitted)]),
  ]);
  try {
    const withDescriptor: { output: Record<string, unknown> }[] = [];
    await run.adapter.committed?.({
      runId: "arn_starter",
      files: run.files,
      inputs: inputs(withDescriptor),
    });
    const without: { output: Record<string, unknown> }[] = [];
    await run.adapter.committed?.({
      runId: "arn_starter",
      files: run.files.filter(
        (file) => file.path !== "project/sandbox-task.json",
      ),
      inputs: inputs(without),
    });
    assert.equal(without.length, 1);
    const output = without[0]?.output ?? {};
    assert.equal("testSummary" in output, false);
    const { testSummary: _summary, ...rest } = withDescriptor[0]?.output ?? {};
    assert.deepEqual(output, rest);
  } finally {
    await rm(run.out, { recursive: true, force: true });
  }
});
