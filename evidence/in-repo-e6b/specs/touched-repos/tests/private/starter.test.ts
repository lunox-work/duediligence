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
import type { AgentModel, AgentTurn } from "../../src/agent/loop.js";
import type { ArtifactFile, ToolInputs } from "../../src/tools/adapter.js";
import {
  STARTER_CHECKS_MAX,
  STARTER_RUNS_MAX,
  STEP_OUTPUT_CHARS,
  createStarterAdapter,
} from "../../src/tools/starter.js";

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
 * A starter run, kept to its log, its step lines, the results the agent
 * was sent and the jobs it created.
 */
async function play(
  turns: AgentTurn[],
  fake: ReturnType<typeof fakeProvider> = fakeProvider(),
) {
  const model = scripted(turns);
  const adapter = createStarterAdapter({
    agent: { model, limits },
    provider: fake.provider,
    now: () => new Date(stamp),
  });
  const out = await mkdtemp(join(tmpdir(), "hidden-touched-repos-starter-"));
  const lines: string[] = [];
  const steps: string[] = [];
  try {
    await adapter.run({
      sourceDir: out,
      outDir: join(out, "out"),
      params: params as never,
      run: null,
      inputs: inputs(),
      signal: new AbortController().signal,
      log: (line) => lines.push(line),
      step: (text) => steps.push(text),
    });
  } catch {
    // A run that never has a submission accepted ends in an error.
  } finally {
    await rm(out, { recursive: true, force: true });
  }
  /** The result the agent got for call `index` of turn `turnIndex`. */
  const result = (turnIndex: number, index = 0) =>
    model.results[turnIndex]?.[index];
  return { model, fake, lines, steps, result };
}
/** The step lines of the starter tools' calls: "<verb> the starter…". */
const starterSteps = (steps: readonly string[]) =>
  steps.filter((step) => / the starter(:|'s )/.test(step));
const refusals = (lines: readonly string[]) =>
  lines.filter((line) => line.includes("refused the starter"));
/** The log a refused check writes, as the spec gives it, from the problems the agent was shown. */
function expectedLog(tool: string, stage: string, content: string): string {
  const problems = content.split("\n");
  const shown = problems.filter((problem) => !problem.includes("tests/private/"));
  const hidden = problems.length - shown.length;
  return [
    `${tool} refused the starter at the ${stage} stage (${problems.length} problem(s)).`,
    ...shown,
    ...(hidden > 0 ? [`${hidden} problem(s) in hidden tests, not shown.`] : []),
  ].join("\n");
}

const twiceFiles = [...candidate.files, ...candidate.files];
const MISSING_SCENARIO = 'import "../src/missing.js";\n';
const MISSING_PROBLEM =
  "sandbox/run.ts: ../src/missing.js does not resolve to a file in the project.";
const mistypedFiles = [
  ...candidate.files,
  { path: "src/a.ts", text: "export const a: number = 'no';\n" },
];
const sumHidden = candidate.hiddenTests.map((hidden) => ({
  ...hidden,
  text: hidden.text.replaceAll("acmeTotal", "sum"),
}));
const globex = [
  { before: "Globex", after: "Vendor", kind: "identifier" },
] as const;
const NAMES_PROBLEM =
  "Name 1: Globex does not occur in the starter, so it renames nothing.";

const RULES_LINE = "it breaks the starter's rules";
const NAMES_LINE = "its pseudonyms do not apply";
const PROJECT_LINE = "its project is refused";
const TYPES_LINE = "it does not compile yet";

// --- before any pseudonyms are set ---

// Extends "[unhappy-3] check_starter before any pseudonyms are set stops at
// rules": the whole log line, header and problem, and nothing else logged as refused.
test("[unhappy-3] check_starter before pseudonyms logs exactly the header and the agent's problem", async () => {
  const run = await play([turn([call("check_starter", candidate)])]);
  const content = run.result(0)?.content ?? "";
  assert.equal(run.result(0)?.is_error, true);
  assert.match(content, /^A starter needs a name table/);
  assert.deepEqual(refusals(run.lines), [
    `check_starter refused the starter at the rules stage (1 problem(s)).\n${content}`,
  ]);
  assert.deepEqual(starterSteps(run.steps), [`Checked the starter: ${RULES_LINE}`]);
});

// The same with run_starter, under its own name, and no job.
test("[unhappy-3] run_starter before pseudonyms stops at rules under its own name and starts no job", async () => {
  const run = await play([turn([call("run_starter", candidate)])]);
  const content = run.result(0)?.content ?? "";
  assert.equal(run.result(0)?.is_error, true);
  assert.match(content, /needs a name table/);
  assert.deepEqual(starterSteps(run.steps), [`Ran the starter: ${RULES_LINE}`]);
  assert.deepEqual(refusals(run.lines), [
    `run_starter refused the starter at the rules stage (1 problem(s)).\n${content}`,
  ]);
  assert.equal(run.fake.jobs(), 0);
});

test("[unhappy-3] submit_starter before pseudonyms stops at rules under its own name and starts no job", async () => {
  const run = await play([turn([call("submit_starter", submitted)])]);
  const content = run.result(0)?.content ?? "";
  assert.match(content, /needs a name table/);
  assert.deepEqual(starterSteps(run.steps), [
    `Submitted the starter: ${RULES_LINE}`,
  ]);
  assert.deepEqual(refusals(run.lines), [
    `submit_starter refused the starter at the rules stage (1 problem(s)).\n${content}`,
  ]);
  assert.equal(run.fake.jobs(), 0);
});

// --- the step line names the stage, whichever tool ran it ---

// Extends "[unhappy-4] check_starter refused for a source file given twice":
// check_starter at the project stage.
test("[unhappy-4] check_starter refused for an unresolved scenario import names the project stage", async () => {
  const run = await play([
    setPseudonyms(),
    turn([call("check_starter", { ...candidate, scenario: MISSING_SCENARIO })]),
  ]);
  assert.equal(run.result(1)?.content, MISSING_PROBLEM);
  assert.equal(run.result(1)?.is_error, true);
  assert.deepEqual(starterSteps(run.steps), [
    `Checked the starter: ${PROJECT_LINE}`,
  ]);
  assert.deepEqual(refusals(run.lines), [
    `check_starter refused the starter at the project stage (1 problem(s)).\n${MISSING_PROBLEM}`,
  ]);
  assert.equal(run.fake.jobs(), 0);
});

// check_starter at the types stage, its log carrying the diagnostic.
test("[unhappy-4] check_starter refused for a type error names the types stage and logs its diagnostic", async () => {
  const run = await play([
    setPseudonyms(),
    turn([call("check_starter", { ...candidate, files: mistypedFiles })]),
  ]);
  const content = run.result(1)?.content ?? "";
  assert.match(content, /^src\/a\.ts:1 TS2322 /);
  assert.deepEqual(starterSteps(run.steps), [`Checked the starter: ${TYPES_LINE}`]);
  assert.deepEqual(refusals(run.lines), [
    expectedLog("check_starter", "types", content),
  ]);
});

// Extends "[unhappy-4] run_starter refused for an unresolved scenario import":
// run_starter at the rules and types stages.
test("[unhappy-4] run_starter refused for a source file given twice names the rules stage and starts no job", async () => {
  const run = await play([
    setPseudonyms(),
    turn([call("run_starter", { ...candidate, files: twiceFiles })]),
  ]);
  assert.equal(run.result(1)?.content, "src/cart.ts is given twice.");
  assert.deepEqual(starterSteps(run.steps), [`Ran the starter: ${RULES_LINE}`]);
  assert.deepEqual(refusals(run.lines), [
    "run_starter refused the starter at the rules stage (1 problem(s)).\nsrc/cart.ts is given twice.",
  ]);
  assert.equal(run.fake.jobs(), 0);
});

test("[unhappy-4] run_starter refused for a type error names the types stage and starts no job", async () => {
  const run = await play([
    setPseudonyms(),
    turn([call("run_starter", { ...candidate, files: mistypedFiles })]),
  ]);
  const content = run.result(1)?.content ?? "";
  assert.match(content, /TS2322/);
  assert.deepEqual(starterSteps(run.steps), [`Ran the starter: ${TYPES_LINE}`]);
  assert.deepEqual(refusals(run.lines), [
    expectedLog("run_starter", "types", content),
  ]);
  assert.equal(run.fake.jobs(), 0);
});

// Extends "[unhappy-4] submit_starter refused for a type error": submit_starter
// at the rules and project stages.
test("[unhappy-4] submit_starter refused for a source file given twice names the rules stage", async () => {
  const run = await play([
    setPseudonyms(),
    turn([call("submit_starter", { ...submitted, files: twiceFiles })]),
  ]);
  assert.deepEqual(starterSteps(run.steps), [
    `Submitted the starter: ${RULES_LINE}`,
  ]);
  assert.deepEqual(refusals(run.lines), [
    "submit_starter refused the starter at the rules stage (1 problem(s)).\nsrc/cart.ts is given twice.",
  ]);
  assert.equal(run.fake.jobs(), 0);
});

test("[unhappy-4] submit_starter refused for an unresolved scenario import names the project stage", async () => {
  const run = await play([
    setPseudonyms(),
    turn([call("submit_starter", { ...submitted, scenario: MISSING_SCENARIO })]),
  ]);
  assert.equal(run.result(1)?.content, MISSING_PROBLEM);
  assert.deepEqual(starterSteps(run.steps), [
    `Submitted the starter: ${PROJECT_LINE}`,
  ]);
  assert.deepEqual(refusals(run.lines), [
    `submit_starter refused the starter at the project stage (1 problem(s)).\n${MISSING_PROBLEM}`,
  ]);
  assert.equal(run.fake.jobs(), 0);
});

// Refused runs use up no run: after more refused runs than there are runs,
// a good candidate still runs, and is described as a baseline as now.
test("[unhappy-4] refused run_starter calls use up no run, so a good one after them still runs", async () => {
  const run = await play([
    setPseudonyms(),
    ...Array.from({ length: STARTER_RUNS_MAX + 1 }, () =>
      turn([call("run_starter", { ...candidate, scenario: MISSING_SCENARIO })]),
    ),
    turn([call("run_starter", candidate)]),
  ]);
  assert.deepEqual(starterSteps(run.steps), [
    ...Array.from(
      { length: STARTER_RUNS_MAX + 1 },
      () => `Ran the starter: ${PROJECT_LINE}`,
    ),
    "Ran the starter's 3 files: the baseline passes",
  ]);
  assert.equal(refusals(run.lines).length, STARTER_RUNS_MAX + 1);
  for (const line of refusals(run.lines))
    assert.equal(
      line,
      `run_starter refused the starter at the project stage (1 problem(s)).\n${MISSING_PROBLEM}`,
    );
  assert.equal(run.fake.jobs(), 1);
});

// --- pseudonyms that rename nothing ---

// Extends "[unhappy-5] check_starter with pseudonyms that rename nothing":
// submit_starter, under its own name.
test("[unhappy-5] submit_starter with pseudonyms that rename nothing stops at names under its own name", async () => {
  const run = await play([
    setPseudonyms(globex),
    turn([call("submit_starter", submitted)]),
  ]);
  assert.equal(run.result(1)?.content, NAMES_PROBLEM);
  assert.equal(run.result(1)?.is_error, true);
  assert.deepEqual(starterSteps(run.steps), [
    `Submitted the starter: ${NAMES_LINE}`,
  ]);
  assert.deepEqual(refusals(run.lines), [
    `submit_starter refused the starter at the names stage (1 problem(s)).\n${NAMES_PROBLEM}`,
  ]);
  assert.equal(run.fake.jobs(), 0);
});

// Two names that rename nothing: both problems, counted in the header.
test("[unhappy-5] two pseudonyms that rename nothing are both logged, counted as two", async () => {
  const run = await play([
    setPseudonyms([
      ...globex,
      { before: "Initech", after: "Firm", kind: "identifier" },
    ]),
    turn([call("check_starter", candidate)]),
  ]);
  assert.deepEqual(starterSteps(run.steps), [`Checked the starter: ${NAMES_LINE}`]);
  assert.deepEqual(refusals(run.lines), [
    [
      "check_starter refused the starter at the names stage (2 problem(s)).",
      NAMES_PROBLEM,
      "Name 2: Initech does not occur in the starter, so it renames nothing.",
    ].join("\n"),
  ]);
});

// Once the pseudonyms are set again, the same candidate passes: the stage
// belongs to the call, not the run.
test("[unhappy-5] a names refusal is followed, once the pseudonyms are fixed, by a passing check with its usual line", async () => {
  const run = await play([
    setPseudonyms(globex),
    turn([call("check_starter", candidate)]),
    setPseudonyms(),
    turn([call("check_starter", candidate)]),
  ]);
  assert.deepEqual(starterSteps(run.steps), [
    `Checked the starter: ${NAMES_LINE}`,
    "Checked the starter: 3 files compile",
  ]);
  assert.deepEqual(refusals(run.lines), [
    `check_starter refused the starter at the names stage (1 problem(s)).\n${NAMES_PROBLEM}`,
  ]);
});

// --- a hidden test that does not compile ---

// Extends "[unhappy-6] a hidden test that does not compile is shown to the
// agent but only counted in the log": run_starter, the whole log line.
test("[unhappy-6] run_starter with a hidden test that does not compile logs only the header and the hidden count", async () => {
  const run = await play([
    setPseudonyms(),
    turn([call("run_starter", { ...candidate, hiddenTests: sumHidden })]),
  ]);
  const content = run.result(1)?.content ?? "";
  assert.match(content, /^tests\/private\/total\.test\.ts:3 TS2305 /);
  assert.deepEqual(starterSteps(run.steps), [`Ran the starter: ${TYPES_LINE}`]);
  assert.deepEqual(refusals(run.lines), [
    "run_starter refused the starter at the types stage (1 problem(s)).\n1 problem(s) in hidden tests, not shown.",
  ]);
  assert.equal(
    run.lines.some((line) => line.includes("tests/private/total.test.ts")),
    false,
  );
  assert.equal(run.fake.jobs(), 0);
});

// Shown and hidden problems together: the shown are logged, the hidden counted.
test("[unhappy-6] a source type error beside a broken hidden test is logged, and the hidden one only counted", async () => {
  const run = await play([
    setPseudonyms(),
    turn([
      call("check_starter", {
        ...candidate,
        files: mistypedFiles,
        hiddenTests: sumHidden,
      }),
    ]),
  ]);
  const content = run.result(1)?.content ?? "";
  const problems = content.split("\n");
  assert.ok(problems.some((problem) => problem.startsWith("src/a.ts:1 TS2322 ")));
  assert.ok(
    problems.some((problem) => problem.startsWith("tests/private/total.test.ts:")),
  );
  const logged = refusals(run.lines);
  assert.deepEqual(logged, [expectedLog("check_starter", "types", content)]);
  assert.ok(logged[0]?.includes("\nsrc/a.ts:1 TS2322 "));
  assert.ok(
    logged[0]?.endsWith("\n1 problem(s) in hidden tests, not shown."),
    logged.join("\n---\n"),
  );
  assert.equal(
    run.lines.some((line) => line.includes("tests/private/total.test.ts:")),
    false,
  );
});

// Two broken hidden tests are both counted.
test("[unhappy-6] two hidden tests that do not compile are counted as two and neither is logged", async () => {
  const hiddenTests = [
    ...sumHidden,
    {
      path: "tests/private/more.test.ts",
      text: 'import { test } from "node:test";\nimport { sum } from "../../src/cart.js";\ntest("more", () => sum);\n',
      expectedBaseline: "fail" as const,
    },
  ];
  const run = await play([
    setPseudonyms(),
    turn([call("check_starter", { ...candidate, hiddenTests })]),
  ]);
  const content = run.result(1)?.content ?? "";
  const problems = content.split("\n");
  assert.equal(problems.length, 2, content);
  assert.ok(problems.every((problem) => problem.includes("tests/private/")));
  assert.deepEqual(refusals(run.lines), [
    "check_starter refused the starter at the types stage (2 problem(s)).\n2 problem(s) in hidden tests, not shown.",
  ]);
  assert.equal(
    run.lines.some(
      (line) =>
        line.includes("tests/private/total.test.ts") ||
        line.includes("tests/private/more.test.ts"),
    ),
    false,
  );
});

// --- calls that never reach the check ---

// Extends "[boundary-5] a schema-invalid check_starter call": run_starter and
// submit_starter that fail their schema get no step line either.
test("[boundary-5] a schema-invalid run_starter call gets no step line, no refusal log and no job", async () => {
  const run = await play([
    setPseudonyms(),
    turn([call("run_starter", { ...candidate, packages: "none" })]),
  ]);
  assert.equal(run.result(1)?.is_error, true);
  assert.deepEqual(starterSteps(run.steps), []);
  assert.deepEqual(refusals(run.lines), []);
  assert.equal(run.fake.jobs(), 0);
});

test("[boundary-5] a submit_starter call without its summary gets no step line and no refusal log", async () => {
  const run = await play([
    setPseudonyms(),
    turn([call("submit_starter", candidate)]),
  ]);
  assert.equal(run.result(1)?.is_error, true);
  assert.deepEqual(starterSteps(run.steps), []);
  assert.deepEqual(refusals(run.lines), []);
  assert.equal(run.fake.jobs(), 0);
});

// A schema-invalid call right after a refused one does not take the refused one's stage.
test("[boundary-5] a schema-invalid check after a refused one gets no step line, and only the refused one is logged", async () => {
  const run = await play([
    setPseudonyms(),
    turn([call("check_starter", { ...candidate, files: twiceFiles })]),
    turn([call("check_starter", { ...candidate, scenario: 7 })]),
    turn([call("run_starter", { ...candidate, files: twiceFiles })]),
    turn([call("run_starter", { ...candidate, hiddenTests: "none" })]),
  ]);
  assert.deepEqual(starterSteps(run.steps), [
    `Checked the starter: ${RULES_LINE}`,
    `Ran the starter: ${RULES_LINE}`,
  ]);
  assert.deepEqual(refusals(run.lines), [
    "check_starter refused the starter at the rules stage (1 problem(s)).\nsrc/cart.ts is given twice.",
    "run_starter refused the starter at the rules stage (1 problem(s)).\nsrc/cart.ts is given twice.",
  ]);
});

// Extends "[boundary-5] the check_starter call after the limit": the checks
// before the limit are refused, and the one after it would be too.
test("[boundary-5] after STARTER_CHECKS_MAX refused checks, a further refusable check gets no step line and no log", async () => {
  const run = await play([
    setPseudonyms(),
    ...Array.from({ length: STARTER_CHECKS_MAX + 2 }, () =>
      turn([call("check_starter", { ...candidate, files: twiceFiles })]),
    ),
  ]);
  assert.match(
    run.result(STARTER_CHECKS_MAX + 1)?.content ?? "",
    /No checks are left/,
  );
  assert.match(
    run.result(STARTER_CHECKS_MAX + 2)?.content ?? "",
    /No checks are left/,
  );
  assert.deepEqual(
    starterSteps(run.steps),
    Array.from(
      { length: STARTER_CHECKS_MAX },
      () => `Checked the starter: ${RULES_LINE}`,
    ),
  );
  assert.equal(refusals(run.lines).length, STARTER_CHECKS_MAX);
  for (const line of refusals(run.lines))
    assert.equal(
      line,
      "check_starter refused the starter at the rules stage (1 problem(s)).\nsrc/cart.ts is given twice.",
    );
});

// --- several checks in one turn ---

// Extends "[concurrency-1] two checks in one turn": three calls, three stages.
test("[concurrency-1] three checks in one turn name rules, project and types, in call order", async () => {
  const run = await play([
    setPseudonyms(),
    turn([
      call("check_starter", { ...candidate, files: twiceFiles }),
      call("check_starter", { ...candidate, scenario: MISSING_SCENARIO }),
      call("check_starter", { ...candidate, files: mistypedFiles }),
    ]),
  ]);
  assert.equal(run.result(1, 0)?.content, "src/cart.ts is given twice.");
  assert.equal(run.result(1, 1)?.content, MISSING_PROBLEM);
  assert.match(run.result(1, 2)?.content ?? "", /TS2322/);
  assert.deepEqual(starterSteps(run.steps), [
    `Checked the starter: ${RULES_LINE}`,
    `Checked the starter: ${PROJECT_LINE}`,
    `Checked the starter: ${TYPES_LINE}`,
  ]);
  assert.deepEqual(refusals(run.lines), [
    "check_starter refused the starter at the rules stage (1 problem(s)).\nsrc/cart.ts is given twice.",
    `check_starter refused the starter at the project stage (1 problem(s)).\n${MISSING_PROBLEM}`,
    expectedLog("check_starter", "types", run.result(1, 2)?.content ?? ""),
  ]);
});

// A passing check between two refused ones writes no log and keeps its line.
test("[concurrency-1] a passing check between two refused ones in one turn keeps its own line and writes no log", async () => {
  const run = await play([
    setPseudonyms(),
    turn([
      call("check_starter", { ...candidate, files: mistypedFiles }),
      call("check_starter", candidate),
      call("check_starter", { ...candidate, files: twiceFiles }),
    ]),
  ]);
  assert.deepEqual(starterSteps(run.steps), [
    `Checked the starter: ${TYPES_LINE}`,
    "Checked the starter: 3 files compile",
    `Checked the starter: ${RULES_LINE}`,
  ]);
  const logged = refusals(run.lines);
  assert.equal(logged.length, 2);
  assert.ok(
    logged[0]?.startsWith("check_starter refused the starter at the types stage"),
  );
  assert.ok(
    logged[1]?.startsWith("check_starter refused the starter at the rules stage"),
  );
});

// Different tools in one turn each log under their own name, in call order.
test("[concurrency-1] check, run and submit refused in one turn each name their own tool and stage, in order", async () => {
  const run = await play([
    setPseudonyms(),
    turn([
      call("check_starter", { ...candidate, files: mistypedFiles }),
      call("run_starter", { ...candidate, scenario: MISSING_SCENARIO }),
      call("submit_starter", { ...submitted, files: twiceFiles }),
    ]),
  ]);
  assert.deepEqual(starterSteps(run.steps), [
    `Checked the starter: ${TYPES_LINE}`,
    `Ran the starter: ${PROJECT_LINE}`,
    `Submitted the starter: ${RULES_LINE}`,
  ]);
  const logged = refusals(run.lines);
  assert.equal(logged.length, 3);
  assert.ok(
    logged[0]?.startsWith("check_starter refused the starter at the types stage"),
  );
  assert.equal(
    logged[1],
    `run_starter refused the starter at the project stage (1 problem(s)).\n${MISSING_PROBLEM}`,
  );
  assert.equal(
    logged[2],
    "submit_starter refused the starter at the rules stage (1 problem(s)).\nsrc/cart.ts is given twice.",
  );
  assert.equal(run.fake.jobs(), 0);
});

// --- what a committed starter run records ---

const DESCRIPTOR = "project/sandbox-task.json";

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
  const out = await mkdtemp(join(tmpdir(), "hidden-touched-repos-starter-"));
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
  /** Writes `text` into the run's directory and points the descriptor entry at it. */
  const withDescriptor = async (text: string): Promise<ArtifactFile[]> => {
    const path = join(out, "other-descriptor.json");
    await writeFile(path, text, "utf8");
    return files.map((file) =>
      file.path === DESCRIPTOR ? { ...file, absolutePath: path } : file,
    );
  };
  const commit = async (
    committedFiles: ArtifactFile[] = files,
    runId = "arn_starter",
  ) => {
    const recorded: { versionId: string; runId: string; output: unknown }[] =
      [];
    await adapter.committed?.({
      runId,
      files: committedFiles,
      inputs: inputs(recorded),
    });
    return recorded;
  };
  return {
    out,
    files,
    read,
    withDescriptor,
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
const OTHER_SUMMARY_TEXT = JSON.stringify({
  title: "anything",
  testSummary: [
    { label: "scenarios", count: 3 },
    { label: "public", count: 7, note: "dropped" },
    { label: "extra", count: -2 },
  ],
});
const OTHER_SUMMARY = [
  { label: "scenarios", count: 3 },
  { label: "public", count: 7 },
  { label: "extra", count: -2 },
];

// Extends "[happy-5] a committed starter run records its descriptor's counts":
// the counts are read from the descriptor file, whatever it holds, and the
// run id is the one committed.
test("[happy-5] a committed starter records what its descriptor file holds, in its order and without extra keys", async () => {
  const run = await playSubmitted(acceptedTurns());
  try {
    const today = await outputToday(run.read);
    assert.notEqual(today.build, null);
    const recorded = await run.commit(
      await run.withDescriptor(OTHER_SUMMARY_TEXT),
      "arn_other",
    );
    assert.deepEqual(recorded, [
      {
        versionId: "sbv_1",
        runId: "arn_other",
        output: { ...today, testSummary: OTHER_SUMMARY },
      },
    ]);
  } finally {
    await run.done();
  }
});

// The descriptor entry is found wherever it is among the files.
test("[happy-5] the descriptor is found first among the committed files as well as where the run put it", async () => {
  const run = await playSubmitted(acceptedTurns());
  try {
    const today = await outputToday(run.read);
    const descriptor = run.files.filter((file) => file.path === DESCRIPTOR);
    assert.equal(descriptor.length, 1);
    const reordered = [
      ...descriptor,
      ...run.files.filter((file) => file.path !== DESCRIPTOR),
    ];
    assert.deepEqual(await run.commit(reordered), [
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

// Extends "[happy-6] a starter kept as not ready still records its counts":
// other counts, read from the descriptor, outside build.
test("[happy-6] a not-ready starter records its descriptor's own counts, whatever they are, with build null", async () => {
  const run = await playSubmitted(spentTurns(), failingBaseline());
  try {
    const today = await outputToday(run.read);
    assert.equal(today.build, null);
    const recorded = await run.commit(
      await run.withDescriptor(OTHER_SUMMARY_TEXT),
      "arn_spent",
    );
    assert.deepEqual(recorded, [
      {
        versionId: "sbv_1",
        runId: "arn_spent",
        output: { ...today, testSummary: OTHER_SUMMARY },
      },
    ]);
  } finally {
    await run.done();
  }
});

test("[happy-6] a not-ready starter whose descriptor counts nothing records an empty summary", async () => {
  const run = await playSubmitted(spentTurns(), failingBaseline());
  try {
    const today = await outputToday(run.read);
    const recorded = await run.commit(
      await run.withDescriptor('{"testSummary":[]}'),
    );
    assert.deepEqual(recorded, [
      {
        versionId: "sbv_1",
        runId: "arn_starter",
        output: { ...today, build: null, testSummary: [] },
      },
    ]);
  } finally {
    await run.done();
  }
});

// Extends "[boundary-8] a starter committed without its descriptor": a
// descriptor entry that cannot be read, or is at another path, or is not
// JSON, leaves the key out; the rest is what the descriptor would have given.
for (const [what, files] of [
  [
    "an entry whose file is missing",
    (run: Awaited<ReturnType<typeof playSubmitted>>) =>
      run.files.map((file) =>
        file.path === DESCRIPTOR
          ? { ...file, absolutePath: join(run.out, "missing.json") }
          : file,
      ),
  ],
  [
    "the descriptor at project/sub/sandbox-task.json",
    (run: Awaited<ReturnType<typeof playSubmitted>>) =>
      run.files.map((file) =>
        file.path === DESCRIPTOR
          ? { ...file, path: "project/sub/sandbox-task.json" }
          : file,
      ),
  ],
  [
    "a descriptor that is not JSON",
    (run: Awaited<ReturnType<typeof playSubmitted>>) =>
      run.withDescriptor("not json"),
  ],
] as const)
  test(`[boundary-8] a starter committed with ${what} records no testSummary key, and otherwise what it records with its descriptor`, async () => {
    const run = await playSubmitted(acceptedTurns());
    try {
      const whole = await run.commit();
      assert.equal(whole.length, 1);
      const withSummary = whole[0]?.output as Record<string, unknown>;
      assert.deepEqual(withSummary.testSummary, CART_SUMMARY);
      const { testSummary: _summary, ...rest } = withSummary;
      const recorded = await run.commit(await files(run));
      assert.equal(recorded.length, 1);
      const output = recorded[0]?.output as Record<string, unknown>;
      assert.equal("testSummary" in output, false);
      assert.deepEqual(recorded, [
        { versionId: "sbv_1", runId: "arn_starter", output: rest },
      ]);
    } finally {
      await run.done();
    }
  });

test("[boundary-8] a not-ready starter committed without its descriptor records build null and no testSummary key", async () => {
  const run = await playSubmitted(spentTurns(), failingBaseline());
  try {
    const today = await outputToday(run.read);
    assert.equal(today.build, null);
    const whole = await run.commit();
    assert.deepEqual(whole, [
      {
        versionId: "sbv_1",
        runId: "arn_starter",
        output: { ...today, testSummary: CART_SUMMARY },
      },
    ]);
    const recorded = await run.commit(
      run.files.filter((file) => file.path !== DESCRIPTOR),
    );
    assert.equal(recorded.length, 1);
    assert.equal("testSummary" in (recorded[0]?.output as object), false);
    assert.deepEqual(recorded[0]?.output, today);
  } finally {
    await run.done();
  }
});
