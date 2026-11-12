import assert from "node:assert/strict";
import { test } from "node:test";
import { starterProblems } from "sandbox-factory";
import type { StarterSubmission } from "sandbox-factory";
import { checkStarter } from "../src/tools/starter-check.js";
import type { StarterCheck } from "../src/tools/starter-check.js";
import { refusedCheckLog } from "../src/tools/starter.js";

/** Any absolute root: the check reads nothing from it. */
const root = "/touched-repos/starter-root";

/** The cart starter, as in starter.test.ts. */
const submission: StarterSubmission = {
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
  summary: "A cart whose total is left to write.",
};
const projectVersion = {
  sandboxId: "sbx_1",
  versionId: "sbv_1",
  version: 1,
  title: "Sum a cart",
  specSummary: "The cart adds up its lines.",
  complexity: "S",
  tags: [],
};

const check = (
  changes: Partial<StarterSubmission> = {},
  vocabulary: readonly string[] = ["acme"],
): StarterCheck =>
  checkStarter({
    root,
    version: projectVersion,
    starter: { ...submission, ...changes },
    spec: null,
    vocabulary,
  });

/** The refused result, narrowed; fails the test when the check passed. */
function refused(result: StarterCheck) {
  assert.equal(result.ok, false, result.problems.join("\n"));
  if (result.ok) throw new Error("unreachable");
  return result;
}

const COMPILER_DIAGNOSTIC = /^\S+:\d+ TS\d+ /;

// --- checkStarter: the stage a refused check stopped at ---

test("[happy-1] the cart starter passes every stage, with no stage on the result", () => {
  const result = check();
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.equal("stage" in result, false);
});

test("[happy-1] a starter passing with an empty vocabulary has no stage either", () => {
  const result = check({}, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.equal("stage" in result, false);
});

test("[unhappy-1] a starter with no name table is refused at the rules stage", () => {
  const result = refused(check({ aliases: [] }));
  assert.equal(result.stage, "rules");
  assert.match(result.problems[0] ?? "", /needs a name table/);
});

test("[unhappy-1] a source file outside src/ is refused at the rules stage, before its broken scenario is looked at", () => {
  const result = refused(
    check({
      files: [{ path: "lib/cart.ts", text: "" }],
      scenario: 'import "../src/missing.js";\n',
    }),
  );
  assert.equal(result.stage, "rules");
  assert.deepEqual(result.problems, [
    "lib/cart.ts: source files live under src/.",
  ]);
});

test("[unhappy-1] a pseudonym that renames nothing is refused at the names stage", () => {
  const result = refused(
    check({
      aliases: [
        { before: "Globex", after: "Vendor", kind: "identifier", paths: [] },
      ],
    }),
  );
  assert.equal(result.stage, "names");
  assert.deepEqual(result.problems, [
    "Name 1: Globex does not occur in the starter, so it renames nothing.",
  ]);
});

test("[unhappy-1] an unresolved scenario import and a workspace name are refused at the project stage", () => {
  const result = refused(
    check({
      aliases: submission.aliases.slice(0, 1),
      scenario: 'import "../src/missing.js";\n',
    }),
  );
  assert.equal(result.stage, "project");
  assert.deepEqual(result.problems, [
    "sandbox/run.ts: ../src/missing.js does not resolve to a file in the project.",
    'src/cart.ts: "acme" names the workspace and appears 3 times in 2 public files: src/cart.ts, tests/public/cart.test.ts. Give it a pseudonym.',
  ]);
});

test("[unhappy-1] a type error is refused at the types stage", () => {
  const result = refused(
    check({
      files: [
        {
          path: "src/cart.ts",
          text: "export const acmeTotal: number = 'no';\n",
        },
      ],
      aliases: submission.aliases.slice(1),
    }),
  );
  assert.equal(result.stage, "types");
  assert.ok(
    result.problems.some((problem) =>
      problem.startsWith("src/cart.ts:1 TS2322"),
    ),
    result.problems.join("\n"),
  );
});

test("[unhappy-2] a workspace name left in a public file stops at the project stage, with no compiler diagnostic", () => {
  const result = refused(
    check({ aliases: submission.aliases.slice(0, 1) }, ["acme"]),
  );
  assert.equal(result.stage, "project");
  assert.ok(result.problems.length > 0);
  for (const problem of result.problems)
    assert.doesNotMatch(problem, COMPILER_DIAGNOSTIC);
});

test("[unhappy-2] a workspace name stops at the project stage even when the source also has a type error", () => {
  const result = refused(
    check(
      {
        files: [
          ...submission.files,
          {
            path: "src/bad.ts",
            text: "export const acmeBad: number = 'no';\n",
          },
        ],
        aliases: submission.aliases.slice(0, 1),
      },
      ["acme"],
    ),
  );
  assert.equal(result.stage, "project");
  for (const problem of result.problems)
    assert.doesNotMatch(problem, COMPILER_DIAGNOSTIC);
});

const misplaced = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    path: `lib/a${index + 1}.ts`,
    text: "",
  }));

test("[boundary-1] 45 misplaced source files are refused at rules with the first 40 problems, in order", () => {
  const changed = {
    ...submission,
    files: [...submission.files, ...misplaced(45)],
  };
  const expected = starterProblems(changed);
  assert.ok(expected.length > 40);
  const result = refused(check({ files: changed.files }));
  assert.equal(result.stage, "rules");
  assert.equal(result.problems.length, 40);
  assert.deepEqual(result.problems, expected.slice(0, 40));
});

test("[boundary-1] 41 misplaced source files are still cut to 40 problems at rules", () => {
  const changed = {
    ...submission,
    files: [...submission.files, ...misplaced(41)],
  };
  const expected = starterProblems(changed);
  assert.ok(expected.length > 40);
  const result = refused(check({ files: changed.files }));
  assert.equal(result.stage, "rules");
  assert.deepEqual(result.problems, expected.slice(0, 40));
});

// --- refusedCheckLog ---

test("[happy-2] a rules refusal with one problem is a header and the problem", () => {
  assert.equal(
    refusedCheckLog("check_starter", "rules", [
      "lib/cart.ts: source files live under src/.",
    ]),
    "check_starter refused the starter at the rules stage (1 problem(s)).\nlib/cart.ts: source files live under src/.",
  );
});

test("[happy-2] the tool name is written as given, and a long problem is not cut short", () => {
  const long = `src/a.ts: ${"x".repeat(50_000)}`;
  assert.equal(
    refusedCheckLog("not a tool", "rules", [long]),
    `not a tool refused the starter at the rules stage (1 problem(s)).\n${long}`,
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
      "submit_starter refused the starter at the types stage (3 problem(s)).",
      "src/cart.ts:1 TS2322 Type 'string' is not assignable to type 'number'.",
      "(project) TS5023 Unknown compiler option 'x'.",
      "1 problem(s) in hidden tests, not shown.",
    ].join("\n"),
  );
});

test("[happy-3] repeated problems are neither deduplicated nor reordered, shown or hidden", () => {
  assert.equal(
    refusedCheckLog("run_starter", "project", [
      "b: second",
      "tests/private/x.test.ts: hidden",
      "a: first",
      "b: second",
      "tests/private/x.test.ts: hidden",
    ]),
    [
      "run_starter refused the starter at the project stage (5 problem(s)).",
      "b: second",
      "a: first",
      "b: second",
      "2 problem(s) in hidden tests, not shown.",
    ].join("\n"),
  );
});

const hiddenOnly =
  "run_starter refused the starter at the rules stage (1 problem(s)).\n1 problem(s) in hidden tests, not shown.";
const shownOnly = (problem: string) =>
  `run_starter refused the starter at the rules stage (1 problem(s)).\n${problem}`;

test("[boundary-2] a problem starting with tests/private/ is not shown", () => {
  const problem =
    "tests/private/total.test.ts is longer than 20000 characters.";
  assert.equal(refusedCheckLog("run_starter", "rules", [problem]), hiddenOnly);
});

test("[boundary-2] a problem naming tests/private/ in its middle is not shown", () => {
  const problem =
    "lib/x.test.ts: hidden tests live under tests/private/ and end in .test.ts.";
  assert.equal(refusedCheckLog("run_starter", "rules", [problem]), hiddenOnly);
});

test("[boundary-2] a problem naming a tests/private/ path after another path is not shown", () => {
  const problem = "src/a.ts and tests/private/A.ts differ only in case.";
  assert.equal(refusedCheckLog("run_starter", "rules", [problem]), hiddenOnly);
});

test("[boundary-2] a problem about hidden tests that names no tests/private/ path is shown", () => {
  const problem =
    "At least one hidden test must fail on the starter: it is how a finished bounty is told apart from an unfinished one.";
  assert.equal(
    refusedCheckLog("run_starter", "rules", [problem]),
    shownOnly(problem),
  );
});

test("[boundary-2] a problem naming tests/public/ is shown", () => {
  const problem = "tests/public/cart.test.ts is given twice.";
  assert.equal(
    refusedCheckLog("run_starter", "rules", [problem]),
    shownOnly(problem),
  );
});

test("[boundary-3] when every problem is a hidden test's, only the header and the count are written", () => {
  assert.equal(
    refusedCheckLog("check_starter", "types", [
      "tests/private/a.test.ts:1 TS2304 Cannot find name 'x'.",
      "tests/private/b.test.ts:2 TS2304 Cannot find name 'y'.",
    ]),
    "check_starter refused the starter at the types stage (2 problem(s)).\n2 problem(s) in hidden tests, not shown.",
  );
});

test("[boundary-3] a single hidden problem gives a header and a count of one, with no trailing newline", () => {
  const log = refusedCheckLog("check_starter", "names", [
    "tests/private/a.test.ts: x",
  ]);
  assert.equal(
    log,
    "check_starter refused the starter at the names stage (1 problem(s)).\n1 problem(s) in hidden tests, not shown.",
  );
  assert.equal(log.endsWith("\n"), false);
});

test("[boundary-4] no problems at the names stage gives the header alone", () => {
  assert.equal(
    refusedCheckLog("check_starter", "names", []),
    "check_starter refused the starter at the names stage (0 problem(s)).",
  );
});

test("[boundary-4] no problems at the project stage gives the header alone, with no hidden count", () => {
  const log = refusedCheckLog("submit_starter", "project", []);
  assert.equal(
    log,
    "submit_starter refused the starter at the project stage (0 problem(s)).",
  );
  assert.equal(log.includes("\n"), false);
});
