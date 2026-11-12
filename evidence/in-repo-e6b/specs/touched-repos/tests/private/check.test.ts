import assert from "node:assert/strict";
import { test } from "node:test";
import { starterProblems } from "sandbox-factory";
import type { StarterSubmission } from "sandbox-factory";
import { checkStarter } from "../../src/tools/starter-check.js";
import type { StarterCheck } from "../../src/tools/starter-check.js";
import { refusedCheckLog } from "../../src/tools/starter.js";

/** Any absolute root: the check reads nothing from it. */
const root = "/hidden-touched-repos/starter-root";

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

const globex = (index = 0) => ({
  before: `Globex${index === 0 ? "" : index}`,
  after: `Vendor${index === 0 ? "" : index}`,
  kind: "identifier" as const,
  paths: [],
});
const mistyped = { path: "src/a.ts", text: "export const a: number = 'no';\n" };
const MISSING_SCENARIO = 'import "../src/missing.js";\n';
const MISSING_PROBLEM =
  "sandbox/run.ts: ../src/missing.js does not resolve to a file in the project.";
const publicMistyped = [
  {
    path: "tests/public/cart.test.ts",
    text: `${submission.publicTests[0]?.text ?? ""}const n: number = 'x';\n`,
  },
];
const sumHidden = submission.hiddenTests.map((hidden) => ({
  ...hidden,
  text: hidden.text.replaceAll("acmeTotal", "sum"),
}));

// --- checkStarter: a passing check has no stage ---

// Extends "[happy-1] the cart starter passes every stage": the key is there
// exactly when the check is refused, not set (to undefined) on every result.
test("[happy-1] a passing check has no stage key, while the same starter refused at rules has one", () => {
  const passed = check();
  assert.equal(passed.ok, true);
  assert.deepEqual(passed.problems, []);
  assert.equal("stage" in passed, false);
  assert.deepEqual(Object.keys(passed).includes("stage"), false);
  const failed = refused(check({ aliases: [] }));
  assert.equal("stage" in failed, true);
  assert.equal(failed.stage, "rules");
});

// Extends "[happy-1] a starter passing with an empty vocabulary": a larger
// starter, with more files, passes too, and has no stage; broken, it has one.
test("[happy-1] a larger starter passing every stage has no stage, and the same starter mistyped stops at types", () => {
  const files = [
    ...submission.files,
    {
      path: "src/util.ts",
      text: "export const half = (n: number): number => n / 2;\n",
    },
  ];
  const publicTests = [
    ...submission.publicTests,
    {
      path: "tests/public/more.test.ts",
      text: 'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { acmeTotal } from "../../src/cart.js";\ntest("still free", () => assert.equal(acmeTotal([]), 0));\n',
    },
  ];
  const passed = check({ files, publicTests }, ["acme", "globex"]);
  assert.equal(passed.ok, true);
  assert.deepEqual(passed.problems, []);
  assert.equal("stage" in passed, false);
  const failed = refused(
    check({ files: [...files, mistyped], publicTests }, ["acme", "globex"]),
  );
  assert.equal(failed.stage, "types");
});

// --- checkStarter: each stage refuses with its own problems ---

// Extends "[unhappy-1] a starter with no name table is refused at the rules stage":
// another of the rules, whose text names hidden tests but no path.
test("[unhappy-1] a starter whose hidden tests all pass on it is refused at the rules stage", () => {
  const changes = {
    hiddenTests: submission.hiddenTests.map((hidden) => ({
      ...hidden,
      expectedBaseline: "pass" as const,
    })),
  };
  const result = refused(check(changes));
  assert.equal(result.stage, "rules");
  assert.deepEqual(result.problems, [
    "At least one hidden test must fail on the starter: it is how a finished bounty is told apart from an unfinished one.",
  ]);
});

// Extends "[unhappy-1] a source file outside src/ is refused at the rules stage":
// a public test outside tests/public/, a problem under tests/.
test("[unhappy-1] a public test outside tests/public/ is refused at the rules stage", () => {
  const changes = {
    publicTests: submission.publicTests.map((item) => ({
      ...item,
      path: "tests/cart.test.ts",
    })),
  };
  const result = refused(check(changes));
  assert.equal(result.stage, "rules");
  assert.deepEqual(result.problems, starterProblems({ ...submission, ...changes }));
  assert.deepEqual(result.problems, [
    "tests/cart.test.ts: public tests live under tests/public/ and end in .test.ts or .test.tsx.",
  ]);
});

// Rules come before names: pseudonyms that rename nothing are not looked at.
test("[unhappy-1] a source file given twice stops at rules even when its pseudonyms rename nothing", () => {
  const result = refused(
    check({
      files: [...submission.files, ...submission.files],
      aliases: [globex()],
    }),
  );
  assert.equal(result.stage, "rules");
  assert.deepEqual(result.problems, ["src/cart.ts is given twice."]);
});

// Extends "[unhappy-1] a pseudonym that renames nothing is refused at the names stage":
// two such names after two that apply, numbered by their place in the table.
test("[unhappy-1] two pseudonyms that rename nothing, after two that do, are refused at names with both problems", () => {
  const result = refused(
    check({
      aliases: [
        ...submission.aliases,
        globex(),
        { before: "Initech", after: "Firm", kind: "identifier", paths: [] },
      ],
    }),
  );
  assert.equal(result.stage, "names");
  assert.deepEqual(result.problems, [
    "Name 3: Globex does not occur in the starter, so it renames nothing.",
    "Name 4: Initech does not occur in the starter, so it renames nothing.",
  ]);
});

// Names come before project: an unresolved scenario import is not looked at.
test("[unhappy-1] a pseudonym that renames nothing stops at names even when the scenario import does not resolve", () => {
  const result = refused(
    check({ aliases: [globex()], scenario: MISSING_SCENARIO }),
  );
  assert.equal(result.stage, "names");
  assert.deepEqual(result.problems, [
    "Name 1: Globex does not occur in the starter, so it renames nothing.",
  ]);
});

// Extends "[unhappy-1] an unresolved scenario import and a workspace name are
// refused at the project stage": the import alone, with every name renamed.
test("[unhappy-1] an unresolved scenario import alone is refused at the project stage", () => {
  const result = refused(check({ scenario: MISSING_SCENARIO }));
  assert.equal(result.stage, "project");
  assert.deepEqual(result.problems, [MISSING_PROBLEM]);
});

// Project comes before types: the type error is not reported.
test("[unhappy-1] an unresolved scenario import stops at project even when a source file has a type error", () => {
  const result = refused(
    check({
      scenario: MISSING_SCENARIO,
      files: [...submission.files, mistyped],
    }),
  );
  assert.equal(result.stage, "project");
  assert.deepEqual(result.problems, [MISSING_PROBLEM]);
});

// Extends "[unhappy-1] a type error is refused at the types stage": the
// error is in a public test, not in src/.
test("[unhappy-1] a type error in a public test is refused at the types stage", () => {
  const result = refused(check({ publicTests: publicMistyped }));
  assert.equal(result.stage, "types");
  assert.deepEqual(result.problems, [
    "tests/public/cart.test.ts:5 TS2322 Type 'string' is not assignable to type 'number'.",
  ]);
});

// A hidden test's diagnostic is still the types stage, whatever its path.
test("[unhappy-1] a hidden test that does not compile is refused at the types stage", () => {
  const result = refused(check({ hiddenTests: sumHidden }));
  assert.equal(result.stage, "types");
  assert.deepEqual(result.problems, [
    "tests/private/total.test.ts:3 TS2305 Module '\"../../src/cart.js\"' has no exported member 'sum'.",
  ]);
});

// --- checkStarter: a workspace name stops at project ---

// Extends "[unhappy-2] a workspace name left in a public file stops at the
// project stage": the other name left, and a type error in a public test.
test("[unhappy-2] AcmeLine left in src/cart.ts stops at project, before a public test's type error", () => {
  const result = refused(
    check(
      { aliases: submission.aliases.slice(1), publicTests: publicMistyped },
      ["acme", "globex"],
    ),
  );
  assert.equal(result.stage, "project");
  assert.deepEqual(result.problems, [
    'src/cart.ts: "acme" names the workspace and appears 2 times in 1 public file: src/cart.ts. Give it a pseudonym.',
  ]);
  for (const problem of result.problems)
    assert.doesNotMatch(problem, COMPILER_DIAGNOSTIC);
});

test("[unhappy-2] a workspace name stops at project even when a hidden test does not compile either", () => {
  const result = refused(
    check({ aliases: submission.aliases.slice(1), hiddenTests: sumHidden }),
  );
  assert.equal(result.stage, "project");
  assert.ok(result.problems.length > 0);
  for (const problem of result.problems)
    assert.doesNotMatch(problem, COMPILER_DIAGNOSTIC);
});

// --- checkStarter: the cap of 40 ---

const misplaced = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    path: `lib/a${index + 1}.ts`,
    text: "",
  }));

// Extends "[boundary-1] 45 misplaced source files are refused at rules":
// many more problems, still 40.
test("[boundary-1] 100 misplaced source files are refused at rules with exactly the first 40 problems", () => {
  const files = [...submission.files, ...misplaced(100)];
  const expected = starterProblems({ ...submission, files });
  assert.ok(expected.length >= 100);
  const result = refused(check({ files }));
  assert.equal(result.stage, "rules");
  assert.deepEqual(result.problems, expected.slice(0, 40));
});

// At the cap itself nothing is cut.
test("[boundary-1] exactly 40 rules problems are all kept", () => {
  const files = [...submission.files, ...misplaced(40)];
  const expected = starterProblems({ ...submission, files });
  assert.equal(expected.length, 40);
  const result = refused(check({ files }));
  assert.equal(result.stage, "rules");
  assert.deepEqual(result.problems, expected);
});

test("[boundary-1] 39 rules problems are all kept", () => {
  const files = [...submission.files, ...misplaced(39)];
  const expected = starterProblems({ ...submission, files });
  assert.equal(expected.length, 39);
  const result = refused(check({ files }));
  assert.equal(result.stage, "rules");
  assert.deepEqual(result.problems, expected);
});

// The cap holds at the names stage too.
test("[boundary-1] 45 pseudonyms that rename nothing are refused at names with 40 problems", () => {
  const result = refused(
    check({
      aliases: [
        ...submission.aliases,
        ...Array.from({ length: 45 }, (_, index) => globex(index + 1)),
      ],
    }),
  );
  assert.equal(result.stage, "names");
  assert.equal(result.problems.length, 40);
  assert.equal(
    result.problems[0],
    "Name 3: Globex1 does not occur in the starter, so it renames nothing.",
  );
  assert.equal(
    result.problems[39],
    "Name 42: Globex40 does not occur in the starter, so it renames nothing.",
  );
});

// The cap holds at the types stage too.
test("[boundary-1] 45 type errors are refused at types with 40 problems", () => {
  const text = `${Array.from(
    { length: 45 },
    (_, index) => `export const v${index}: number = 'x';`,
  ).join("\n")}\n`;
  const result = refused(
    check({ files: [...submission.files, { path: "src/a.ts", text }] }),
  );
  assert.equal(result.stage, "types");
  assert.equal(result.problems.length, 40);
  for (const problem of result.problems)
    assert.match(problem, /^src\/a\.ts:\d+ TS2322 /);
});

// --- refusedCheckLog: header and shown problems ---

// Extends "[happy-2] a rules refusal with one problem": each stage and tool.
test("[happy-2] the header names each stage and tool as given", () => {
  for (const [tool, stage] of [
    ["check_starter", "names"],
    ["run_starter", "project"],
    ["submit_starter", "types"],
    ["submit_starter", "rules"],
  ] as const)
    assert.equal(
      refusedCheckLog(tool, stage, ["src/a.ts: one."]),
      `${tool} refused the starter at the ${stage} stage (1 problem(s)).\nsrc/a.ts: one.`,
    );
});

// Extends "[happy-2] a rules refusal with one problem": several problems,
// shown in the order given, not sorted.
test("[happy-2] several shown problems follow the header one per line, in the order given", () => {
  assert.equal(
    refusedCheckLog("check_starter", "project", [
      "src/z.ts: last by name.",
      "sandbox/run.ts: ../src/missing.js does not resolve to a file in the project.",
      "src/a.ts: first by name.",
      "README.md: something.",
    ]),
    [
      "check_starter refused the starter at the project stage (4 problem(s)).",
      "src/z.ts: last by name.",
      "sandbox/run.ts: ../src/missing.js does not resolve to a file in the project.",
      "src/a.ts: first by name.",
      "README.md: something.",
    ].join("\n"),
  );
});

// Extends "[happy-2] the tool name is written as given": an empty name and
// one with spaces are not checked or changed.
test("[happy-2] an empty tool name is written as given", () => {
  assert.equal(
    refusedCheckLog("", "rules", ["src/a.ts: x."]),
    " refused the starter at the rules stage (1 problem(s)).\nsrc/a.ts: x.",
  );
  assert.equal(
    refusedCheckLog("  Odd Tool  ", "types", ["src/a.ts: x."]),
    "  Odd Tool   refused the starter at the types stage (1 problem(s)).\nsrc/a.ts: x.",
  );
});

// Many problems are neither capped nor cut.
test("[happy-2] 60 shown problems are all written, with the count of 60", () => {
  const problems = Array.from(
    { length: 60 },
    (_, index) => `src/a${index}.ts: problem ${index} ${"y".repeat(500)}`,
  );
  assert.equal(
    refusedCheckLog("run_starter", "types", problems),
    [
      "run_starter refused the starter at the types stage (60 problem(s)).",
      ...problems,
    ].join("\n"),
  );
});

// --- refusedCheckLog: hidden problems counted ---

// Extends "[happy-3] a hidden test's problem is counted": hidden problems
// first, last and between, three of five.
test("[happy-3] hidden problems first, between and last are counted, and the shown keep their order", () => {
  assert.equal(
    refusedCheckLog("check_starter", "types", [
      "tests/private/a.test.ts:1 TS2304 Cannot find name 'x'.",
      "src/cart.ts:2 TS2322 Type 'string' is not assignable to type 'number'.",
      "tests/private/b.test.ts:4 TS2304 Cannot find name 'y'.",
      "tests/public/cart.test.ts:3 TS2304 Cannot find name 'z'.",
      "tests/private/c.test.ts:9 TS2304 Cannot find name 'w'.",
    ]),
    [
      "check_starter refused the starter at the types stage (5 problem(s)).",
      "src/cart.ts:2 TS2322 Type 'string' is not assignable to type 'number'.",
      "tests/public/cart.test.ts:3 TS2304 Cannot find name 'z'.",
      "3 problem(s) in hidden tests, not shown.",
    ].join("\n"),
  );
});

// The header's count includes the hidden ones: it is not the shown count.
test("[happy-3] the header counts all problems given, the last line only the hidden ones", () => {
  const log = refusedCheckLog("run_starter", "rules", [
    "src/a.ts: one.",
    "src/b.ts: two.",
    "tests/private/x.test.ts: hidden.",
  ]);
  const lines = log.split("\n");
  assert.equal(
    lines[0],
    "run_starter refused the starter at the rules stage (3 problem(s)).",
  );
  assert.equal(lines.at(-1), "1 problem(s) in hidden tests, not shown.");
  assert.equal(lines.length, 4);
  assert.equal(log.includes("tests/private/x.test.ts"), false);
});

// --- refusedCheckLog: what counts as a hidden test's problem ---

const hiddenOnly = (tool: string, stage: string) =>
  `${tool} refused the starter at the ${stage} stage (1 problem(s)).\n1 problem(s) in hidden tests, not shown.`;
const shownOnly = (tool: string, stage: string, problem: string) =>
  `${tool} refused the starter at the ${stage} stage (1 problem(s)).\n${problem}`;

// Extends "[boundary-2] a problem naming tests/private/ in its middle":
// the mark at the very end, and inside a longer path.
test("[boundary-2] a problem ending in tests/private/ is not shown", () => {
  assert.equal(
    refusedCheckLog("check_starter", "types", ["hidden tests go in tests/private/"]),
    hiddenOnly("check_starter", "types"),
  );
});

test("[boundary-2] a problem naming a path that merely contains tests/private/ is not shown", () => {
  assert.equal(
    refusedCheckLog("submit_starter", "project", [
      "vendor/tests/private/x.ts: does not resolve.",
    ]),
    hiddenOnly("submit_starter", "project"),
  );
});

// Extends "[boundary-2] a problem naming tests/public/ is shown": near
// misses of the mark are shown.
test("[boundary-2] tests/private without its slash is shown", () => {
  const problem = "tests/private is not a file.";
  assert.equal(
    refusedCheckLog("run_starter", "rules", [problem]),
    shownOnly("run_starter", "rules", problem),
  );
});

test("[boundary-2] the mark in other letter case is shown", () => {
  const problem = "Tests/Private/total.test.ts is given twice.";
  assert.equal(
    refusedCheckLog("run_starter", "rules", [problem]),
    shownOnly("run_starter", "rules", problem),
  );
});

test("[boundary-2] a hidden test named without its directory is shown", () => {
  const problem = "private/total.test.ts: tests/ is where tests live.";
  assert.equal(
    refusedCheckLog("check_starter", "names", [problem]),
    shownOnly("check_starter", "names", problem),
  );
});

test("[boundary-2] a backslashed path is shown", () => {
  const problem = "tests\\private\\total.test.ts is given twice.";
  assert.equal(
    refusedCheckLog("check_starter", "rules", [problem]),
    shownOnly("check_starter", "rules", problem),
  );
});

// --- refusedCheckLog: every problem hidden ---

// Extends "[boundary-3] when every problem is a hidden test's": more of
// them, repeated, at another stage.
test("[boundary-3] five hidden problems, repeated, give the header and a count of five", () => {
  const problem = "tests/private/a.test.ts:1 TS2304 Cannot find name 'x'.";
  const log = refusedCheckLog("run_starter", "project", [
    problem,
    problem,
    "tests/private/b.test.ts: two.",
    problem,
    "src/a.ts and tests/private/A.ts differ only in case.",
  ]);
  assert.equal(
    log,
    "run_starter refused the starter at the project stage (5 problem(s)).\n5 problem(s) in hidden tests, not shown.",
  );
  assert.equal(log.endsWith("\n"), false);
});

// --- refusedCheckLog: no problems ---

// Extends "[boundary-4] no problems at the names stage": the other stages.
test("[boundary-4] no problems at the rules and types stages give the header alone", () => {
  assert.equal(
    refusedCheckLog("run_starter", "rules", []),
    "run_starter refused the starter at the rules stage (0 problem(s)).",
  );
  assert.equal(
    refusedCheckLog("submit_starter", "types", []),
    "submit_starter refused the starter at the types stage (0 problem(s)).",
  );
});
