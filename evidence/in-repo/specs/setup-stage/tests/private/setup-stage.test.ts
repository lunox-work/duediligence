/**
 * Hidden tests for home's setup stage and getting-started checklist
 * (ticket #84).
 *
 * `setup.ts` is pure, so every case is a plain `SetupFacts` value: the spec's
 * background facts, with only the fields a test names changed. Where a test
 * sweeps many facts, the expected value is worked out from the spec's
 * definitions by `expected` below, not from the code under test.
 */

import { expect, test } from "vitest";

import {
  setupComplete,
  setupStage,
  setupSteps,
  type SetupFacts,
  type SetupStage,
  type SetupStep,
  type SetupStepId,
} from "../../src/features/onboarding/setup";

interface FactsChange {
  readonly jira?: Partial<SetupFacts["jira"]>;
  readonly github?: Partial<SetupFacts["github"]>;
  readonly proposals?: number;
  readonly bounties?: number;
  readonly canManage?: boolean;
}

/** The background facts, with only the fields `change` names replaced. */
const facts = (change: FactsChange = {}): SetupFacts => ({
  jira: {
    available: true,
    connected: 0,
    broken: 0,
    boards: 0,
    ...change.jira,
  },
  github: {
    available: true,
    connected: 0,
    repositories: 0,
    ...change.github,
  },
  proposals: change.proposals ?? 0,
  bounties: change.bounties ?? 0,
  canManage: change.canManage ?? true,
});

const ids = (steps: SetupStep[]) => steps.map((step) => step.id);

const currentIds = (steps: SetupStep[]) =>
  steps.filter((step) => step.current).map((step) => step.id);

const doneOf = (steps: SetupStep[]) =>
  Object.fromEntries(steps.map((step) => [step.id, step.done]));

const sizeStep = (steps: SetupStep[]) =>
  steps.find((step) => step.id === "size");

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
};

/** What the spec's definitions say for `value`, step by step. */
const expected = (value: SetupFacts) => {
  const jira = value.jira.available && value.jira.connected > 0;
  const github = value.github.available && value.github.connected > 0;
  const sized = value.proposals > 0 || value.bounties > 0;
  const stage: SetupStage =
    jira && github ? "both" : jira ? "jira" : github ? "github" : "barebone";
  const candidates: [SetupStepId, boolean, boolean][] = [
    ["jira", value.jira.available && (jira || value.canManage), jira],
    ["github", value.github.available && (github || value.canManage), github],
    ["size", true, sized],
  ];
  const listed = candidates
    .filter(([, shown]) => shown)
    .map(([id, , done]) => ({ id, done }));
  const first = listed.findIndex((step) => !step.done);
  const steps: SetupStep[] = listed.map((step, index) => ({
    ...step,
    current: index === first,
  }));
  return { stage, steps, complete: listed.every((step) => step.done) };
};

/**
 * Every mix of availability and canManage, crossed with `counts` in each of
 * the four counts that decide anything. Broken sites, boards and repositories
 * vary along the way, since they must never change a result.
 */
const sweep = (counts: number[]): SetupFacts[] => {
  const all: SetupFacts[] = [];
  let index = 0;
  for (const jiraAvailable of [true, false])
    for (const githubAvailable of [true, false])
      for (const canManage of [true, false])
        for (const jira of counts)
          for (const github of counts)
            for (const proposals of counts)
              for (const bounties of counts) {
                index += 1;
                all.push(
                  facts({
                    jira: {
                      available: jiraAvailable,
                      connected: jira,
                      broken: [0, 2, 1][index % 3],
                      boards: [0, 4, 9, 1][index % 4],
                    },
                    github: {
                      available: githubAvailable,
                      connected: github,
                      repositories: [0, 7, 3, 1, 2][index % 5],
                    },
                    canManage,
                    proposals,
                    bounties,
                  }),
                );
              }
  return all;
};

const ODD = [
  0,
  1,
  -1,
  Number.NaN,
  0.5,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

// @happy: The stage follows the healthy connections

// Extends "[happy-1] the stage names the tools with healthy connections": larger counts, each tool alone and together.
test("[happy-1] larger healthy connection counts name the connected tools", () => {
  const rows: [number, number, SetupStage][] = [
    [100, 0, "jira"],
    [0, 42, "github"],
    [7, 9, "both"],
    [1, 1000, "both"],
    [2, 0, "jira"],
    [0, 2, "github"],
  ];
  for (const [jira, github, stage] of rows) {
    expect(
      setupStage(
        facts({ jira: { connected: jira }, github: { connected: github } }),
      ),
    ).toBe(stage);
  }
});

// Extends "[happy-1] the smallest positive connection count is enough to connect a tool": GitHub alone, by a tiny count.
test("[happy-1] the smallest positive GitHub count alone gives the github stage", () => {
  expect(setupStage(facts({ github: { connected: Number.MIN_VALUE } }))).toBe(
    "github",
  );
});

test("[happy-1] the stage names exactly the connected tools over every mix of facts", () => {
  for (const value of sweep([0, 1, 3]))
    expect(setupStage(value)).toBe(expected(value).stage);
});

// @happy: A fresh workspace a manager can set up lists all three steps

// Extends "[happy-2] a fresh workspace without Jira on offer starts at the GitHub step": the other tool missing.
test("[happy-2] a fresh workspace without GitHub on offer lists Jira current, then size", () => {
  expect(setupSteps(facts({ github: { available: false } }))).toEqual([
    { id: "jira", done: false, current: true },
    { id: "size", done: false, current: false },
  ]);
});

test("[happy-2] a fresh workspace offering neither tool lists only a current size step", () => {
  expect(
    setupSteps(
      facts({ jira: { available: false }, github: { available: false } }),
    ),
  ).toEqual([{ id: "size", done: false, current: true }]);
});

// @happy: Each step is done on its own fact

// Extends "[happy-3] each step is done on its own fact": every combination, with larger counts.
test("[happy-3] each step's done value follows only its own fact, in every combination", () => {
  for (const jira of [0, 3])
    for (const github of [0, 2])
      for (const proposals of [0, 9])
        for (const bounties of [0, 4]) {
          expect(
            doneOf(
              setupSteps(
                facts({
                  jira: { connected: jira },
                  github: { connected: github },
                  proposals,
                  bounties,
                }),
              ),
            ),
          ).toEqual({
            jira: jira > 0,
            github: github > 0,
            size: proposals > 0 || bounties > 0,
          });
        }
});

// Extends "[happy-3] each step is done on its own fact": one sizing count positive beside an odd other.
test("[happy-3] a positive sizing count sizes the workspace whatever a negative or NaN other count says", () => {
  const rows: [number, number][] = [
    [3, -5],
    [1, Number.NaN],
    [Number.NaN, 2],
    [-4, 1],
    [1, Number.NEGATIVE_INFINITY],
    [Number.NEGATIVE_INFINITY, 0.25],
  ];
  for (const [proposals, bounties] of rows) {
    expect(sizeStep(setupSteps(facts({ proposals, bounties })))?.done).toBe(
      true,
    );
  }
});

// Extends "[happy-3] fractional counts above zero mark their steps done": infinite counts.
test("[happy-3] infinite counts mark their steps done", () => {
  expect(
    doneOf(
      setupSteps(
        facts({
          jira: { connected: Number.POSITIVE_INFINITY },
          github: { connected: Number.POSITIVE_INFINITY },
          bounties: Number.POSITIVE_INFINITY,
        }),
      ),
    ),
  ).toEqual({ jira: true, github: true, size: true });
});

test("[happy-3] negative and NaN connection counts leave a manager's tool steps listed and undone", () => {
  expect(
    doneOf(
      setupSteps(
        facts({
          jira: { connected: -1 },
          github: { connected: Number.NaN },
          proposals: 1,
        }),
      ),
    ),
  ).toEqual({ jira: false, github: false, size: true });
});

test("[happy-3] done values follow the definitions over every mix of odd counts", () => {
  for (const value of sweep(ODD))
    expect(doneOf(setupSteps(value))).toEqual(
      doneOf(expected(value).steps),
    );
});

// @happy: current moves to the first undone step in list order

// Extends "[happy-4] current is the first undone step in list order": GitHub not on offer.
test("[happy-4] with GitHub not on offer, current is the first undone of jira and size", () => {
  const rows: [number, number, SetupStepId][] = [
    [0, 0, "jira"],
    [0, 1, "jira"],
    [1, 0, "size"],
  ];
  for (const [jira, proposals, current] of rows) {
    expect(
      currentIds(
        setupSteps(
          facts({
            jira: { connected: jira },
            github: { available: false, connected: 0 },
            proposals,
          }),
        ),
      ),
    ).toEqual([current]);
  }
});

// Extends "[happy-4] with Jira not on offer, current skips to the first undone listed step": a step left out for a member.
test("[happy-4] a member with GitHub connected and nothing sized has the size step current", () => {
  expect(
    setupSteps(facts({ canManage: false, github: { connected: 1 } })),
  ).toEqual([
    { id: "github", done: true, current: false },
    { id: "size", done: false, current: true },
  ]);
});

test("[happy-4] a member with Jira connected and nothing sized has the size step current", () => {
  expect(
    setupSteps(facts({ canManage: false, jira: { connected: 2 } })),
  ).toEqual([
    { id: "jira", done: true, current: false },
    { id: "size", done: false, current: true },
  ]);
});

test("[happy-4] bounties alone do not move current off the Jira step", () => {
  expect(
    currentIds(setupSteps(facts({ github: { connected: 1 }, bounties: 2 }))),
  ).toEqual(["jira"]);
});

test("[happy-4] exactly one step is current, the first undone listed one, over every mix of facts", () => {
  for (const value of sweep(ODD)) {
    const steps = setupSteps(value);
    const want = expected(value).steps;
    expect(currentIds(steps)).toEqual(currentIds(want));
  }
});

// @happy: Completion follows the listed steps

// Extends "[happy-5] setupComplete is true exactly when every listed step is done": other availability and canManage mixes.
test("[happy-5] completion needs every listed step done, in mixes the spec's rows leave out", () => {
  const rows: [boolean, number, boolean, number, boolean, number, boolean][] = [
    [true, 0, false, 0, true, 1, false],
    [false, 0, true, 0, true, 1, false],
    [false, 0, true, 1, true, 1, true],
    [false, 0, true, 1, true, 0, false],
    [true, 0, true, 1, false, 1, true],
    [true, 1, true, 1, false, 0, false],
    [false, 0, true, 0, false, 1, true],
    [false, 0, false, 0, true, 0, false],
    [true, 5, true, 3, true, 8, true],
  ];
  for (const [
    jiraAvailable,
    jira,
    githubAvailable,
    github,
    canManage,
    proposals,
    complete,
  ] of rows) {
    expect(
      setupComplete(
        facts({
          jira: { available: jiraAvailable, connected: jira },
          github: { available: githubAvailable, connected: github },
          canManage,
          proposals,
        }),
      ),
    ).toBe(complete);
  }
});

test("[happy-5] a member whose only Jira sites are broken is complete once something is sized", () => {
  expect(
    setupComplete(
      facts({ canManage: false, jira: { connected: 0, broken: 2 }, proposals: 1 }),
    ),
  ).toBe(true);
});

test("[happy-5] a manager with only broken Jira sites is not complete even with GitHub connected and something sized", () => {
  expect(
    setupComplete(
      facts({
        jira: { connected: 0, broken: 3 },
        github: { connected: 1 },
        proposals: 2,
        bounties: 1,
      }),
    ),
  ).toBe(false);
});

test("[happy-5] tool counts on a server that does not offer the tool do not complete setup without sizing", () => {
  expect(
    setupComplete(
      facts({
        jira: { available: false, connected: 4 },
        github: { available: false, connected: 4 },
      }),
    ),
  ).toBe(false);
});

// @boundary: Boards, repositories, proposals and bounties do not change the stage

// Extends "[boundary-1] boards, repositories, proposals and bounties leave a Jira workspace at the jira stage": every stage, larger counts.
test("[boundary-1] boards, repositories, proposals and bounties leave every stage as it was", () => {
  const rows: [number, number, SetupStage][] = [
    [0, 0, "barebone"],
    [1, 0, "jira"],
    [0, 1, "github"],
    [1, 1, "both"],
  ];
  for (const [jira, github, stage] of rows) {
    for (const [boards, repositories, proposals, bounties] of [
      [50, 0, 0, 0],
      [0, 30, 0, 0],
      [0, 0, 8, 0],
      [0, 0, 0, 6],
      [12, 40, 100, 25],
    ]) {
      expect(
        setupStage(
          facts({
            jira: { connected: jira, boards },
            github: { connected: github, repositories },
            proposals,
            bounties,
          }),
        ),
      ).toBe(stage);
    }
  }
});

// @boundary: GitHub repositories without a GitHub connection are not a GitHub stage

// Extends "[boundary-2] GitHub repositories without a GitHub connection are barebone": other repository counts and odd connection counts.
test("[boundary-2] GitHub repositories without a positive GitHub connection count are barebone, at any repository count", () => {
  for (const repositories of [1, 1000, Number.POSITIVE_INFINITY])
    for (const connected of [0, -1, Number.NaN]) {
      expect(setupStage(facts({ github: { connected, repositories } }))).toBe(
        "barebone",
      );
    }
});

test("[boundary-2] GitHub repositories on a server without GitHub are not a GitHub stage", () => {
  expect(
    setupStage(facts({ github: { available: false, repositories: 5 } })),
  ).toBe("barebone");
  expect(
    setupStage(
      facts({
        jira: { connected: 2 },
        github: { available: false, repositories: 5 },
      }),
    ),
  ).toBe("jira");
});

// @boundary: canManage does not change the stage

// Extends "[boundary-3] canManage false gives the same stage as canManage true for every connection mix": availability and odd counts too.
test("[boundary-3] canManage false gives the stage of the connected tools over every mix of availability and counts", () => {
  for (const value of sweep([0, 1, -1, Number.NaN])) {
    if (value.canManage) continue;
    expect(setupStage(value)).toBe(expected(value).stage);
    expect(setupStage(value)).toBe(setupStage({ ...value, canManage: true }));
  }
});

test("[boundary-3] someone who cannot manage sees the github stage with only GitHub connected", () => {
  expect(
    setupStage(facts({ canManage: false, github: { connected: 3 } })),
  ).toBe("github");
});

// @boundary: Odd counts are read, not rejected

// Extends "[boundary-4] negative, NaN and fractional connection counts are read without throwing": other odd values, on either tool.
test("[boundary-4] more odd connection counts are read without throwing", () => {
  const rows: [number, number, SetupStage][] = [
    [Number.NEGATIVE_INFINITY, 0, "barebone"],
    [0, 0.5, "github"],
    [0, Number.NaN, "barebone"],
    [1, Number.NaN, "jira"],
    [Number.NaN, Number.NaN, "barebone"],
    [-0.5, 2, "github"],
    [1e-300, -1e300, "jira"],
    [Number.MAX_VALUE, -Number.MIN_VALUE, "jira"],
    [0.001, 0.999, "both"],
  ];
  for (const [jira, github, stage] of rows) {
    const value = facts({
      jira: { connected: jira },
      github: { connected: github },
    });
    expect(() => setupStage(value)).not.toThrow();
    expect(setupStage(value)).toBe(stage);
  }
});

test("[boundary-4] odd counts in every field are read by all three functions without throwing", () => {
  for (const odd of ODD) {
    const value = facts({
      jira: { connected: odd, broken: odd, boards: odd },
      github: { connected: odd, repositories: odd },
      proposals: odd,
      bounties: odd,
    });
    expect(() => setupStage(value)).not.toThrow();
    expect(() => setupSteps(value)).not.toThrow();
    expect(() => setupComplete(value)).not.toThrow();
    expect(setupStage(value)).toBe(odd > 0 ? "both" : "barebone");
  }
});

// @boundary: Negative and NaN proposal and bounty counts are not sized

// Extends "[boundary-5] negative and NaN proposal and bounty counts leave the size step undone": other odd values, in either field.
test("[boundary-5] a negative bounty count beside zero proposals is not sized", () => {
  expect(
    sizeStep(setupSteps(facts({ proposals: 0, bounties: -1 })))?.done,
  ).toBe(false);
});

test("[boundary-5] negative, NaN, negative-zero and negative-infinite sizing counts in any pair are not sized", () => {
  const odd = [0, -0, -1, -0.5, Number.NaN, Number.NEGATIVE_INFINITY];
  for (const proposals of odd)
    for (const bounties of odd) {
      expect(sizeStep(setupSteps(facts({ proposals, bounties })))?.done).toBe(
        false,
      );
    }
});

test("[boundary-5] a member's lone size step stays undone and current with NaN and negative sizing counts", () => {
  expect(
    setupSteps(
      facts({ canManage: false, proposals: Number.NaN, bounties: -3 }),
    ),
  ).toEqual([{ id: "size", done: false, current: true }]);
});

// @boundary: A tool the server does not offer has no step

// Extends "[boundary-6] a tool the server does not offer has no step even with a connection count": with canManage, broken sites and large counts.
test("[boundary-6] a tool the server does not offer has no step whatever its counts or the person's role", () => {
  for (const canManage of [true, false]) {
    expect(
      ids(
        setupSteps(
          facts({
            canManage,
            jira: { available: false, connected: 9, broken: 2, boards: 3 },
            github: { connected: 1 },
          }),
        ),
      ),
    ).toEqual(["github", "size"]);
    expect(
      ids(
        setupSteps(
          facts({
            canManage,
            jira: { connected: 1 },
            github: { available: false, connected: 9, repositories: 3 },
          }),
        ),
      ),
    ).toEqual(["jira", "size"]);
  }
});

test("[boundary-6] leaving out a tool's step does not disturb done and current of the others", () => {
  expect(
    setupSteps(
      facts({
        jira: { available: false, connected: 3 },
        github: { connected: 1 },
      }),
    ),
  ).toEqual([
    { id: "github", done: true, current: false },
    { id: "size", done: false, current: true },
  ]);
  expect(
    setupSteps(
      facts({ github: { available: false, connected: 4 }, proposals: 1 }),
    ),
  ).toEqual([
    { id: "jira", done: false, current: true },
    { id: "size", done: true, current: false },
  ]);
});

test("[boundary-6] listed steps keep the order jira, github, size, ending with size, over every mix of facts", () => {
  for (const value of sweep(ODD))
    expect(ids(setupSteps(value))).toEqual(ids(expected(value).steps));
});

// @boundary: Someone who cannot manage the workspace is not asked to connect a tool, but sees one already connected

// Extends "[boundary-7] someone who cannot manage sees only the steps of tools already connected, and size": odd and large counts.
test("[boundary-7] a member sees a tool's step only once its healthy count is positive", () => {
  const rows: [number, number, SetupStepId[]][] = [
    [0.5, 0, ["jira", "size"]],
    [0, 0.5, ["github", "size"]],
    [-1, Number.NaN, ["size"]],
    [Number.NaN, -2, ["size"]],
    [Number.POSITIVE_INFINITY, 20, ["jira", "github", "size"]],
    [Number.NEGATIVE_INFINITY, 3, ["github", "size"]],
  ];
  for (const [jira, github, want] of rows) {
    expect(
      ids(
        setupSteps(
          facts({
            canManage: false,
            jira: { connected: jira },
            github: { connected: github },
          }),
        ),
      ),
    ).toEqual(want);
  }
});

test("[boundary-7] a member with both tools connected and nothing sized sees both done and size current", () => {
  expect(
    setupSteps(
      facts({
        canManage: false,
        jira: { connected: 1 },
        github: { connected: 1 },
      }),
    ),
  ).toEqual([
    { id: "jira", done: true, current: false },
    { id: "github", done: true, current: false },
    { id: "size", done: false, current: true },
  ]);
});

test("[boundary-7] a member with GitHub connected on a server without Jira sees github and size", () => {
  expect(
    ids(
      setupSteps(
        facts({
          canManage: false,
          jira: { available: false },
          github: { connected: 2 },
        }),
      ),
    ),
  ).toEqual(["github", "size"]);
});

// @boundary: Boards and repositories alone complete no step

// Extends "[boundary-8] boards and repositories alone complete no step": large counts beside broken sites.
test("[boundary-8] large board and repository counts beside broken sites complete no step", () => {
  const steps = setupSteps(
    facts({
      jira: { boards: 1000, broken: 3 },
      github: { repositories: 500 },
    }),
  );
  expect(steps).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: false, current: false },
  ]);
});

test("[boundary-8] boards on a server without GitHub complete no step", () => {
  expect(
    setupSteps(
      facts({
        jira: { boards: 5 },
        github: { available: false, repositories: 6 },
      }),
    ),
  ).toEqual([
    { id: "jira", done: false, current: true },
    { id: "size", done: false, current: false },
  ]);
});

// @boundary: Sizing before connecting does not move current past an undone step

// Extends "[boundary-9] sizing before connecting leaves the Jira step current": a bounty instead of proposals.
test("[boundary-9] a bounty before connecting leaves the Jira step current", () => {
  expect(setupSteps(facts({ bounties: 2 }))).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: true, current: false },
  ]);
});

// Extends "[boundary-9] GitHub connected and sized before Jira still leaves the Jira step current": the other tool first.
test("[boundary-9] Jira connected and sized before GitHub leaves the GitHub step current", () => {
  expect(
    setupSteps(facts({ jira: { connected: 1 }, proposals: 3 })),
  ).toEqual([
    { id: "jira", done: true, current: false },
    { id: "github", done: false, current: true },
    { id: "size", done: true, current: false },
  ]);
});

test("[boundary-9] with Jira not on offer, sizing before connecting GitHub leaves the GitHub step current", () => {
  expect(
    setupSteps(facts({ jira: { available: false }, proposals: 4 })),
  ).toEqual([
    { id: "github", done: false, current: true },
    { id: "size", done: true, current: false },
  ]);
});

// @boundary: A member with nothing connected has the size step current

// Extends "[boundary-10] a member with nothing connected has the size step current": boards, repositories, broken sites and odd counts.
test("[boundary-10] a member with only boards, repositories, broken sites and non-positive counts has the size step current", () => {
  expect(
    setupSteps(
      facts({
        canManage: false,
        jira: { connected: -1, broken: 4, boards: 6 },
        github: { connected: Number.NaN, repositories: 8 },
      }),
    ),
  ).toEqual([{ id: "size", done: false, current: true }]);
});

test("[boundary-10] a member on a server offering neither tool has the size step current", () => {
  expect(
    setupSteps(
      facts({
        canManage: false,
        jira: { available: false, connected: 1 },
        github: { available: false, connected: 1 },
      }),
    ),
  ).toEqual([{ id: "size", done: false, current: true }]);
});

// @boundary: Every step done leaves none current

// Extends "[boundary-11] every step done leaves none current": proposals and large counts instead of a single bounty.
test("[boundary-11] every step done by proposals and large counts leaves none current", () => {
  expect(
    setupSteps(
      facts({ jira: { connected: 4 }, github: { connected: 6 }, proposals: 20 }),
    ),
  ).toEqual([
    { id: "jira", done: true, current: false },
    { id: "github", done: true, current: false },
    { id: "size", done: true, current: false },
  ]);
});

test("[boundary-11] a member with both tools connected and something sized has none current", () => {
  expect(
    setupSteps(
      facts({
        canManage: false,
        jira: { connected: 1 },
        github: { connected: 1 },
        bounties: 1,
      }),
    ),
  ).toEqual([
    { id: "jira", done: true, current: false },
    { id: "github", done: true, current: false },
    { id: "size", done: true, current: false },
  ]);
});

test("[boundary-11] with GitHub not on offer, Jira connected and something sized leaves none current", () => {
  expect(
    setupSteps(
      facts({
        jira: { connected: 1 },
        github: { available: false },
        proposals: 1,
      }),
    ),
  ).toEqual([
    { id: "jira", done: true, current: false },
    { id: "size", done: true, current: false },
  ]);
});

// @boundary: A hand-written bounty completes the size step as a proposal would

// Extends "[boundary-12] a hand-written bounty completes setup as a proposal would": a bounty beside a negative or NaN proposal count.
test("[boundary-12] a bounty completes setup beside a negative or NaN proposal count", () => {
  for (const [proposals, bounties] of [
    [-1, 1],
    [Number.NaN, 1],
    [-5, 0.5],
    [Number.NEGATIVE_INFINITY, 3],
  ]) {
    expect(
      setupComplete(
        facts({
          jira: { connected: 1 },
          github: { connected: 1 },
          proposals,
          bounties,
        }),
      ),
    ).toBe(true);
  }
});

// Extends "[boundary-12] a member's lone size step is completed by a bounty with no proposals": a server offering only Jira.
test("[boundary-12] a bounty completes setup on a server offering only Jira", () => {
  expect(
    setupComplete(
      facts({
        jira: { connected: 2 },
        github: { available: false },
        proposals: 0,
        bounties: 7,
      }),
    ),
  ).toBe(true);
});

// @boundary: setupComplete agrees with setupSteps for any facts

// Extends "[boundary-13] setupComplete agrees with setupSteps over negative, NaN, fractional and infinite counts": more values, and the expected answer.
test("[boundary-13] setupComplete agrees with setupSteps and the definitions over a wide grid of facts", () => {
  for (const value of sweep(ODD)) {
    const steps = setupSteps(value);
    const complete = setupComplete(value);
    expect(complete).toBe(steps.every((step) => step.done));
    expect(complete).toBe(expected(value).complete);
    if (complete) expect(currentIds(steps)).toEqual([]);
  }
});

test("[boundary-13] setupComplete agrees with setupSteps for negative zero and the smallest counts", () => {
  for (const value of sweep([-0, Number.MIN_VALUE, -Number.MIN_VALUE])) {
    const steps = setupSteps(value);
    const complete = setupComplete(value);
    expect(complete).toBe(steps.every((step) => step.done));
    expect(complete).toBe(expected(value).complete);
    if (complete) expect(currentIds(steps)).toEqual([]);
  }
});

// @boundary: The facts are left as they were

// Extends "[boundary-14] the functions leave deeply frozen facts as they were": unfrozen facts, whose nested objects must not be replaced either.
test("[boundary-14] the functions leave unfrozen facts and their nested objects as they were", () => {
  const value = facts({
    canManage: false,
    jira: { connected: Number.NaN, broken: 3, boards: 2 },
    github: { connected: -1, repositories: 4 },
    proposals: Number.NEGATIVE_INFINITY,
    bounties: 0.5,
  });
  const { jira, github } = value;
  const before = structuredClone(value);
  setupStage(value);
  setupSteps(value);
  setupComplete(value);
  expect(value).toEqual(before);
  expect(value.jira).toBe(jira);
  expect(value.github).toBe(github);
  expect(Object.keys(value)).toEqual(Object.keys(before));
  expect(Object.keys(value.jira)).toEqual(Object.keys(before.jira));
  expect(Object.keys(value.github)).toEqual(Object.keys(before.github));
});

test("[boundary-14] deeply frozen facts give the results the spec defines and are left as they were", () => {
  const value = deepFreeze(
    facts({
      canManage: false,
      jira: { connected: 0, broken: 2 },
      github: { connected: 1, repositories: 3 },
      bounties: 1,
    }),
  );
  const before = structuredClone(value);
  expect(setupStage(value)).toBe("github");
  expect(setupSteps(value)).toEqual([
    { id: "github", done: true, current: false },
    { id: "size", done: true, current: false },
  ]);
  expect(setupComplete(value)).toBe(true);
  expect(value).toEqual(before);
});

test("[boundary-14] deeply frozen facts with counts for tools the server does not offer are left as they were", () => {
  const value = deepFreeze(
    facts({
      jira: { available: false, connected: 5 },
      github: { available: false, connected: 5 },
      proposals: 2,
    }),
  );
  const before = structuredClone(value);
  expect(() => setupStage(value)).not.toThrow();
  expect(() => setupSteps(value)).not.toThrow();
  expect(() => setupComplete(value)).not.toThrow();
  expect(value).toEqual(before);
});

// @boundary: Each setupSteps call returns a new array

// Extends "[boundary-15] each setupSteps call returns an equal but new array": more calls, and a completed checklist.
test("[boundary-15] three setupSteps calls on a completed checklist give three distinct equal arrays", () => {
  const value = facts({
    jira: { connected: 1 },
    github: { connected: 1 },
    proposals: 1,
  });
  const results = [setupSteps(value), setupSteps(value), setupSteps(value)];
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
  expect(results[1]).not.toBe(results[0]);
  expect(results[2]).not.toBe(results[0]);
  expect(results[2]).not.toBe(results[1]);
});

test("[boundary-15] emptying one setupSteps result does not change the next", () => {
  const value = facts({ github: { connected: 1 } });
  const first = setupSteps(value);
  first.length = 0;
  expect(setupSteps(value)).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: true, current: false },
    { id: "size", done: false, current: false },
  ]);
});

test("[boundary-15] equal facts in distinct objects give equal steps in distinct arrays", () => {
  const first = setupSteps(facts({ canManage: false, jira: { connected: 1 } }));
  const second = setupSteps(
    facts({ canManage: false, jira: { connected: 1 } }),
  );
  expect(second).toEqual(first);
  expect(second).not.toBe(first);
});

// @unhappy: Broken Jira connections do not make Jira connected

// Extends "[unhappy-1] broken Jira connections do not make Jira connected": broken sites beside healthy ones of both tools, and larger counts.
test("[unhappy-1] broken Jira connections beside healthy ones of both tools give both", () => {
  expect(
    setupStage(
      facts({ jira: { connected: 1, broken: 5 }, github: { connected: 2 } }),
    ),
  ).toBe("both");
});

test("[unhappy-1] any number of broken Jira connections without a positive healthy count never make Jira connected", () => {
  for (const broken of [1, 10, 1000, Number.POSITIVE_INFINITY])
    for (const connected of [0, -1, -0.5]) {
      expect(setupStage(facts({ jira: { connected, broken } }))).toBe(
        "barebone",
      );
      expect(
        setupStage(
          facts({ jira: { connected, broken }, github: { connected: 3 } }),
        ),
      ).toBe("github");
    }
});

test("[unhappy-1] a healthy Jira connection outnumbered by broken ones is still the jira stage", () => {
  expect(setupStage(facts({ jira: { connected: 2, broken: 9 } }))).toBe("jira");
  expect(setupStage(facts({ jira: { connected: 0.5, broken: 4 } }))).toBe(
    "jira",
  );
});

// @unhappy: available false overrides the connection count

// Extends "[unhappy-2] a tool the server does not offer is not connected, whatever its count": fractional and large counts, each tool.
test("[unhappy-2] fractional and large counts for a tool the server does not offer do not connect it", () => {
  const rows: [boolean, number, boolean, number, SetupStage][] = [
    [false, 0.5, true, 0, "barebone"],
    [true, 0, false, 0.5, "barebone"],
    [true, 5, false, 100, "jira"],
    [false, 100, true, 3, "github"],
    [false, 1, true, 1, "github"],
    [true, 1, false, 1, "jira"],
    [false, 7, false, 0, "barebone"],
    [true, 0, false, 7, "barebone"],
  ];
  for (const [jiraAvailable, jira, githubAvailable, github, stage] of rows) {
    expect(
      setupStage(
        facts({
          jira: { available: jiraAvailable, connected: jira },
          github: { available: githubAvailable, connected: github },
        }),
      ),
    ).toBe(stage);
  }
});

test("[unhappy-2] a tool the server does not offer is not connected for someone who cannot manage either", () => {
  expect(
    setupStage(
      facts({
        canManage: false,
        jira: { available: false, connected: 3 },
        github: { connected: 1 },
      }),
    ),
  ).toBe("github");
});

// @unhappy: A member whose workspace has only broken Jira sites sees no Jira step

// Extends "[unhappy-3] a member whose workspace has only broken Jira sites sees no Jira step": more broken sites, boards, and something sized.
test("[unhappy-3] a member with many broken Jira sites, boards and something sized sees only a done size step", () => {
  expect(
    setupSteps(
      facts({
        canManage: false,
        jira: { connected: 0, broken: 12, boards: 4 },
        proposals: 1,
      }),
    ),
  ).toEqual([{ id: "size", done: true, current: false }]);
});

test("[unhappy-3] a member with broken Jira sites and a NaN or negative healthy count sees no Jira step", () => {
  for (const connected of [Number.NaN, -1, Number.NEGATIVE_INFINITY]) {
    expect(
      ids(
        setupSteps(
          facts({ canManage: false, jira: { connected, broken: 3 } }),
        ),
      ),
    ).toEqual(["size"]);
  }
});

// @unhappy: Broken Jira sites leave the Jira step undone for a manager

// Extends "[unhappy-4] broken Jira sites keep the Jira step current after GitHub is connected": something sized as well.
test("[unhappy-4] broken Jira sites keep the Jira step undone and current after GitHub is connected and something sized", () => {
  expect(
    setupSteps(
      facts({
        jira: { connected: 0, broken: 4 },
        github: { connected: 1 },
        proposals: 2,
      }),
    ),
  ).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: true, current: false },
    { id: "size", done: true, current: false },
  ]);
});

test("[unhappy-4] many broken Jira sites with boards leave the Jira step undone for a manager on a server without GitHub", () => {
  expect(
    setupSteps(
      facts({
        jira: { connected: 0, broken: 100, boards: 3 },
        github: { available: false },
      }),
    ),
  ).toEqual([
    { id: "jira", done: false, current: true },
    { id: "size", done: false, current: false },
  ]);
});
