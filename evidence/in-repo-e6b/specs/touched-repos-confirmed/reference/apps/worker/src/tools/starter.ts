/**
 * The starter adapter: for a generated version, an agent writes the project
 * a contributor starts from out of the bounty's own title, description and
 * stack, and the worker builds it and checks its baseline, as a build does
 * for a sliced version.
 *
 * There is no repository: the run reads no source and the agent has no
 * repository tools. The agent writes in the bounty's own vocabulary and
 * submits the name table that renames it; the project is built from the
 * renamed starter, and the table becomes the version's, as a sliced
 * version's is. It type-checks candidates in memory (`check_starter`)
 * and runs them for real in a fresh evaluation job (`run_starter`), whose
 * output it is shown, since everything in a starter is its own writing.
 * An answer is accepted when its baseline passes; once the runs are spent,
 * the last answer is kept as a build that is not ready, so a person can
 * see what went wrong. The set and the build land on the version only
 * after the run commits, and only while the draft still points at it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PRIVATE_TESTS_DIR,
  STARTER_LIMITS,
  STARTER_SET_SCHEMA_VERSION,
  STARTER_TOOL_VERSION,
  aliasStarter,
  canonicalJson,
  nameTableProblems,
  isStarterParams,
  starterScope,
  transformConfigOf,
} from "sandbox-factory";
import type {
  AcceptanceTest,
  BaselineReport,
  EvaluationEnvironment,
  EvaluationProvider,
  GeneratedFile,
  ProjectBlocker,
  ProjectVersion,
  SandboxBuildManifest,
  SpecDraft,
  StarterSet,
  StarterSubmission,
} from "sandbox-factory";
import { z } from "zod";
import {
  entryPointSchema,
  starterSetSchema,
  starterSubmissionSchema,
} from "@sandbox-factory/shared";
import { AnalysisError } from "../errors.js";
import type {
  AgentSettings,
  AgentTool,
  AgentToolResult,
} from "../agent/loop.js";
import { inputCount, runAgent } from "../agent/loop.js";
import {
  STARTER_SYSTEM_PROMPT,
  starterBountySection,
} from "../agent/prompts.js";
import { invalidInput } from "../agent/repo-tools.js";
import type { ArtifactFile, ToolAdapter, ToolRunInput } from "./adapter.js";
import {
  descriptorTestSummary,
  previewProject,
  reportedBaselineOf,
  writeBuildOutputs,
} from "./sandbox-build.js";
import { sha256 } from "./slice/hash.js";
import { checkStarter } from "./starter-check.js";
import type { StarterCheckStage } from "./starter-check.js";

/** Candidates one run may type-check, and run for real, before it must submit. */
export const STARTER_CHECKS_MAX = 16;
export const STARTER_RUNS_MAX = 5;
export { STEP_OUTPUT_CHARS } from "./sandbox-build.js";
export const STARTER_SET_PATH = "starter-set.json";

/** What a hidden test's problem starts with: `PRIVATE_TESTS_DIR` followed by `/`. */
export const HIDDEN_TEST_MARK = `${PRIVATE_TESTS_DIR}/`;

/**
 * The run log entry for a starter check that refused: a header naming the
 * tool, the stage and how many problems, then the problems that are not a
 * hidden test's, then a count of those that are.
 */
export function refusedCheckLog(
  tool: string,
  stage: StarterCheckStage,
  problems: readonly string[],
): string {
  const shown = problems.filter(
    (problem) => !problem.startsWith(HIDDEN_TEST_MARK),
  );
  const hidden = problems.length - shown.length;
  const lines = [
    `${tool} refused (${stage}): ${problems.length} ${problems.length === 1 ? "problem" : "problems"}.`,
    ...shown
      .slice(0, REFUSED_SHOWN_MAX)
      .map(
        (problem) =>
          `  ${problem.length > REFUSED_PROBLEM_CHARS ? `${problem.slice(0, REFUSED_PROBLEM_CHARS)}…` : problem}`,
      ),
  ];
  if (shown.length > REFUSED_SHOWN_MAX)
    lines.push(`  and ${shown.length - REFUSED_SHOWN_MAX} more`);
  if (hidden > 0) lines.push(`  and ${hidden} in hidden tests, not shown`);
  return lines.join("\n");
}

/** Problems a refusal's log entry shows, and the characters it keeps of each. */
const REFUSED_SHOWN_MAX = 10;
const REFUSED_PROBLEM_CHARS = 300;

/** What a step line says of a check refused at each stage. */
const REFUSED_PHRASES: Record<StarterCheckStage, string> = {
  rules: "its files break the starter's rules",
  names: "its names need fixing",
  project: "its project does not generate yet",
  types: "it does not compile yet",
};

/**
 * A starter file's shape, without the directory it must live in: where
 * each file lives is the check's first stage (`starterProblems`), so a
 * misplaced file is refused at `rules` and logged as such, not turned
 * away as an invalid input.
 */
const starterFileShape = z.strictObject({
  path: entryPointSchema,
  text: z.string().max(STARTER_LIMITS.fileChars),
});
const submissionSchema = starterSubmissionSchema
  .omit({ aliases: true })
  .extend({
    files: z.array(starterFileShape).min(1).max(STARTER_LIMITS.files),
    publicTests: z.array(starterFileShape).max(STARTER_LIMITS.publicTests),
    hiddenTests: z
      .array(
        starterFileShape.extend({ expectedBaseline: z.enum(["pass", "fail"]) }),
      )
      .min(1)
      .max(STARTER_LIMITS.hiddenTests),
  });
const candidateSchema = submissionSchema.omit({ summary: true });

const fileItems = (description: string) => ({
  type: "array",
  description,
  items: {
    type: "object",
    properties: {
      path: { type: "string" },
      text: { type: "string" },
    },
    required: ["path", "text"],
    additionalProperties: false,
  },
});
const candidateProperties = {
  files: fileItems("The source, under src/."),
  publicTests: fileItems("Tests under tests/public/ that pass on the starter."),
  hiddenTests: {
    type: "array",
    description:
      "Acceptance tests under tests/private/, each with its outcome on the starter.",
    items: {
      type: "object",
      properties: {
        path: { type: "string" },
        text: { type: "string" },
        expectedBaseline: { type: "string", enum: ["pass", "fail"] },
      },
      required: ["path", "text", "expectedBaseline"],
      additionalProperties: false,
    },
  },
  packages: {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        version: { type: "string", description: "An exact version." },
      },
      required: ["name", "version"],
      additionalProperties: false,
    },
  },
  scenario: { type: "string", description: "TypeScript for sandbox/run.ts." },
};
const candidateRequired = [
  "files",
  "publicTests",
  "hiddenTests",
  "packages",
  "scenario",
];
/**
 * The pseudonyms, set apart from the starter: with them, the three
 * starter tools' strict schemas compile past the grammar's size limit, so
 * this one is loose and checked when it runs.
 */
const pseudonymsProperties = {
  aliases: {
    type: "array",
    description:
      "The pseudonyms, applied in order: each name the starter takes from the bounty's own vocabulary, and the neutral one the developer reads instead.",
    items: {
      type: "object",
      properties: {
        before: {
          type: "string",
          description: "The name as the starter writes it.",
        },
        after: {
          type: "string",
          description: "The neutral name the developer reads.",
        },
        kind: {
          type: "string",
          enum: ["identifier", "text"],
          description:
            "identifier: a TypeScript name, matched whole. text: a word or phrase in strings and comments, matched anywhere.",
        },
      },
      required: ["before", "after", "kind"],
      additionalProperties: false,
    },
  },
};
const pseudonymsSchema = starterSubmissionSchema.pick({ aliases: true });

/** A candidate's files, as a step says them: "12 files". */
function starterFiles(input: unknown): string {
  const files =
    inputCount(input, "files") +
    inputCount(input, "publicTests") +
    inputCount(input, "hiddenTests");
  return `${files} ${files === 1 ? "file" : "files"}`;
}

/** A run of a candidate, as a step: whether it built, and its baseline. */
function ranStarter(
  verb: string,
  input: unknown,
  result: AgentToolResult,
  stage: StarterCheckStage | undefined,
): string | null {
  if (stage !== undefined)
    return `${verb} the starter: ${REFUSED_PHRASES[stage]}`;
  if (result.content.startsWith("No runs are left")) return null;
  if (result.content.startsWith("The baseline passes."))
    return `${verb} the starter's ${starterFiles(input)}: the baseline passes`;
  if (result.content.startsWith("The baseline does not pass."))
    return `${verb} the starter's ${starterFiles(input)}: the baseline does not pass yet`;
  return result.isError === true
    ? `${verb} the starter: it does not build yet`
    : null;
}

/** One baseline, built and run for a candidate. */
interface StarterBuild {
  readonly files: GeneratedFile[];
  readonly blockers: ProjectBlocker[];
  readonly baseline: BaselineReport;
  readonly evaluator: EvaluationEnvironment;
  /** The hidden tests in public names, as the version keeps them. */
  readonly hiddenTests: readonly AcceptanceTest[];
  /** What the agent is told: each step, and the output of those that failed. */
  readonly report: string;
}

export function createStarterAdapter(options: {
  readonly agent: AgentSettings;
  /** `null` when the worker has none: generation fails before the agent starts. */
  readonly provider: EvaluationProvider | null;
  readonly now?: () => Date;
}): ToolAdapter {
  const now = options.now ?? (() => new Date());
  return {
    name: "sandbox_starter",
    version: STARTER_TOOL_VERSION,
    async run(input: ToolRunInput): Promise<ArtifactFile[]> {
      const params = input.params;
      if (!isStarterParams(params)) throw new AnalysisError("tool_failed");
      const model = options.agent.model;
      if (model === null) {
        input.log("No agent model is configured on this worker.");
        throw new AnalysisError("agent_unavailable");
      }
      const provider = options.provider;
      if (provider === null) {
        input.log("No evaluation provider is configured on this worker.");
        throw new AnalysisError("evaluation_failed");
      }
      // The version this run was queued for, still a draft of the same task.
      const stored = await input.inputs.getVersion(params.sandboxVersionId);
      if (
        stored === null ||
        stored.source.origin !== "starter" ||
        stored.version.frozenAt !== null ||
        stored.source.approvedTaskSha256 !== params.approvedTaskSha256
      )
        throw new AnalysisError("tool_failed");
      const { version } = stored;
      const task = stored.source.approvedTask;
      const spec: SpecDraft | null = task.spec?.draft ?? null;
      const projectVersion: ProjectVersion = {
        sandboxId: version.sandboxId,
        versionId: version.id,
        version: version.version,
        title: version.title,
        specSummary: version.specSummary,
        complexity: version.complexity,
        tags: version.tags,
      };
      input.log("Starter agent started.");
      const check = (starter: StarterSubmission) =>
        checkStarter({
          root: input.sourceDir,
          version: projectVersion,
          starter,
          spec,
          vocabulary: params.vocabulary ?? [],
        });
      // The stage each refused call stopped at, for its step line, which
      // is asked for once the turn's calls have all run.
      const refusedAt = new WeakMap<AgentToolResult, StarterCheckStage>();
      const refused = (
        tool: string,
        checked: Extract<ReturnType<typeof check>, { ok: false }>,
      ): AgentToolResult => {
        input.log(refusedCheckLog(tool, checked.stage, checked.problems));
        const result = { content: checked.problems.join("\n"), isError: true };
        refusedAt.set(result, checked.stage);
        return result;
      };
      let checks = 0;
      let runs = 0;
      const build = async (
        tool: string,
        starter: StarterSubmission,
      ): Promise<StarterBuild | { refused: AgentToolResult }> => {
        const checked = check(starter);
        if (!checked.ok) return { refused: refused(tool, checked) };
        runs += 1;
        const files = [...checked.project.files];
        const blockers = [...checked.project.blockers];
        // Shown as the version's files while this candidate's baseline runs.
        await previewProject(input, files, runs);
        // The hidden tests run against the renamed project, renamed with it.
        const hiddenTests = checked.starter.hiddenTests;
        const { baseline, evaluator, report } = await reportedBaselineOf(
          provider,
          {
            label: version.id,
            files,
            acceptanceTests: hiddenTests,
            blockers,
            signal: input.signal,
            log: input.log,
            now,
            timing: input.timing,
          },
        );
        return { files, blockers, baseline, evaluator, hiddenTests, report };
      };
      // The table the starter tools rename by, until it is set again.
      let pseudonyms: StarterSubmission["aliases"] = [];
      const pseudonymsTool: AgentTool = {
        name: "set_pseudonyms",
        describe: (_input, result) =>
          result.isError === true
            ? null
            : "Set the names the starter is renamed by",
        description:
          "Set the pseudonyms check_starter, run_starter and submit_starter rename the starter by, replacing any set before. Set them before the first check.",
        inputSchema: {
          properties: pseudonymsProperties,
          required: ["aliases"],
          additionalProperties: false,
        },
        strict: false,
        async run(raw) {
          const parsed = pseudonymsSchema.safeParse(raw);
          if (!parsed.success) return invalidInput(parsed.error.issues);
          const problems = nameTableProblems(parsed.data.aliases);
          if (problems.length > 0)
            return { content: problems.join("\n"), isError: true };
          pseudonyms = parsed.data.aliases;
          return {
            content: `${pseudonyms.length} pseudonym${pseudonyms.length === 1 ? "" : "s"} set; the starter tools rename by them.`,
          };
        },
      };
      const checkTool: AgentTool = {
        name: "check_starter",
        describe: (input, result) => {
          const stage = refusedAt.get(result);
          if (stage !== undefined)
            return `Checked the starter: ${REFUSED_PHRASES[stage]}`;
          if (result.content.startsWith("No checks are left")) return null;
          return result.isError === true
            ? "Checked the starter: it was refused"
            : `Checked the starter: ${starterFiles(input)} compile`;
        },
        description: `Type-check the starter as \`npm run build\` would, and check where each file lives. At most ${STARTER_CHECKS_MAX} checks per run.`,
        inputSchema: {
          properties: candidateProperties,
          required: candidateRequired,
          additionalProperties: false,
        },
        async run(raw) {
          const parsed = candidateSchema.safeParse(raw);
          if (!parsed.success) return invalidInput(parsed.error.issues);
          if (checks >= STARTER_CHECKS_MAX)
            return {
              content: "No checks are left. Run or submit the starter now.",
              isError: true,
            };
          checks += 1;
          const result = check({
            ...parsed.data,
            summary: "-",
            aliases: pseudonyms,
          });
          return result.ok
            ? { content: "The starter compiles." }
            : refused("check_starter", result);
        },
      };
      const runTool: AgentTool = {
        name: "run_starter",
        describe: (input, result) =>
          ranStarter("Ran", input, result, refusedAt.get(result)),
        description: `Build and run the starter in a fresh job: install, build, the walkthrough, the public tests and each hidden test. Shows each step, and the output of those that failed. Runs are shared with submit_starter: ${STARTER_RUNS_MAX} per run in all.`,
        inputSchema: {
          properties: candidateProperties,
          required: candidateRequired,
          additionalProperties: false,
        },
        async run(raw): Promise<AgentToolResult> {
          const parsed = candidateSchema.safeParse(raw);
          if (!parsed.success) return invalidInput(parsed.error.issues);
          // One run is kept for the submission.
          if (runs >= STARTER_RUNS_MAX - 1)
            return {
              content: "No runs are left but the submission's. Submit now.",
              isError: true,
            };
          const result = await build("run_starter", {
            ...parsed.data,
            summary: "-",
            aliases: pseudonyms,
          });
          if ("refused" in result) return result.refused;
          return { content: result.report, isError: !result.baseline.ok };
        },
      };
      let accepted: {
        readonly starter: StarterSubmission;
        readonly build: StarterBuild;
      } | null = null;
      const submitTool: AgentTool = {
        name: "submit_starter",
        describe: (input, result) =>
          result.accepted === true
            ? `Submitted the starter: ${starterFiles(input)}`
            : ranStarter("Submitted", input, result, refusedAt.get(result)),
        description:
          "Submit the starter. It is checked and run once more, and accepted when the baseline passes.",
        inputSchema: {
          properties: {
            ...candidateProperties,
            summary: {
              type: "string",
              description:
                "What the starter holds and what is left for the developer, in a few sentences.",
            },
          },
          required: [...candidateRequired, "summary"],
          additionalProperties: false,
        },
        async run(raw): Promise<AgentToolResult> {
          const parsed = submissionSchema.safeParse(raw);
          if (!parsed.success) return invalidInput(parsed.error.issues);
          const starter = { ...parsed.data, aliases: pseudonyms };
          const result = await build("submit_starter", starter);
          if ("refused" in result) return result.refused;
          // A failing baseline is sent back while runs remain; after that,
          // the answer is kept as it is, as a build that is not ready.
          if (!result.baseline.ok && runs < STARTER_RUNS_MAX)
            return { content: result.report, isError: true };
          accepted = { starter, build: result };
          return { content: "Recorded.", accepted: true };
        },
      };
      const outcome = await runAgent({
        model,
        step: input.step,
        onTurn: input.timing?.turn,
        system: STARTER_SYSTEM_PROMPT,
        prompt: starterBountySection({
          title: task.title,
          description: task.summary,
          stack: params.stack,
          spec,
          context: "context" in task ? task.context : undefined,
          vocabulary: params.vocabulary ?? [],
        }),
        tools: [pseudonymsTool, checkTool, runTool, submitTool],
        submitTool: "submit_starter",
        limits: options.agent.limits,
        signal: input.signal,
        log: input.log,
      });
      const answer = accepted as {
        readonly starter: StarterSubmission;
        readonly build: StarterBuild;
      } | null;
      if (answer === null) throw new AnalysisError("agent_incomplete");
      const set: StarterSet = {
        schemaVersion: STARTER_SET_SCHEMA_VERSION,
        toolVersion: STARTER_TOOL_VERSION,
        sandboxVersionId: version.id,
        approvedTaskSha256: params.approvedTaskSha256,
        stack: params.stack,
        ...answer.starter,
        usage: outcome.usage,
      };
      const setText = canonicalJson(set);
      const starterSha256 = sha256(setText);
      await mkdir(input.outDir, { recursive: true });
      const setPath = join(input.outDir, STARTER_SET_PATH);
      await writeFile(setPath, setText, "utf8");
      const { manifest, written } = await writeBuildOutputs({
        outDir: input.outDir,
        toolVersion: STARTER_TOOL_VERSION,
        sandboxVersionId: version.id,
        aliasRules: set.aliases,
        bindings: {
          sourceSnapshotId: null,
          sourceCommitSha: null,
          sliceRunId: null,
          manifestSha256: null,
          contractSha256: null,
          starterSha256,
          // What the version's transform becomes once this run commits.
          transformConfigSha256: sha256(
            canonicalJson(
              transformConfigOf({
                aliasRules: set.aliases,
                dependencyChoices: {},
                acceptanceTests: answer.build.hiddenTests,
                starterSha256,
              }),
            ),
          ),
          approvedTaskSha256: params.approvedTaskSha256,
        },
        files: answer.build.files,
        importRewrites: [],
        renames: [],
        dependencies: starterScope(set).dependencies,
        baseline: answer.build.baseline,
        evaluator: answer.build.evaluator,
        blockers: answer.build.blockers,
      });
      input.log(
        manifest.ready
          ? `Starter recorded and built: ${set.files.length} source files, ${set.hiddenTests.length} hidden tests.`
          : `Starter recorded as diagnostic output (${manifest.blockers.length} blocker(s)).`,
      );
      return [
        {
          path: STARTER_SET_PATH,
          absolutePath: setPath,
          kind: "starter_set",
          contentType: "application/json",
          meta: {
            files: set.files.length,
            publicTests: set.publicTests.length,
            hiddenTests: set.hiddenTests.length,
            aliases: set.aliases.length,
            packages: set.packages.length,
            summary: set.summary,
            usage: set.usage,
          },
        },
        ...written,
      ];
    },
    /**
     * The starter, its hidden tests and scope, and a ready build's
     * evidence become the draft's, while it still points at this run.
     */
    async committed({ runId, files, inputs }) {
      const setFile = files.find((item) => item.path === STARTER_SET_PATH);
      const manifestFile = files.find(
        (item) => item.path === "build-manifest.json",
      );
      if (setFile === undefined || manifestFile === undefined) return;
      const setText = await readFile(setFile.absolutePath, "utf8");
      const set = starterSetSchema.parse(JSON.parse(setText));
      const manifest = JSON.parse(
        await readFile(manifestFile.absolutePath, "utf8"),
      ) as SandboxBuildManifest;
      // The hidden tests as the build ran them: renamed by the set's table,
      // which renames each file alone, so the spec is not needed for them.
      // A rule only the spec uses renames nothing here, and was checked
      // against the spec when the starter was accepted.
      const renamed = aliasStarter(set, null, { requireUse: false });
      if (!renamed.ok) throw new AnalysisError("tool_failed");
      const testSummary = await descriptorTestSummary(files);
      await inputs.recordStarterOutput(set.sandboxVersionId, runId, {
        starterSha256: sha256(setText),
        aliasRules: set.aliases,
        acceptanceTests: renamed.starter.hiddenTests,
        scope: starterScope(set),
        transformConfigSha256: manifest.transformConfigSha256,
        build: manifest.ready
          ? {
              harnessSha256: manifest.harnessSha256,
              toolchainDigest: manifest.toolchainDigest,
            }
          : null,
        ...(testSummary === undefined ? {} : { testSummary }),
      });
    },
  };
}
