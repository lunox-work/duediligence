/**
 * Tests for home's setup stage and getting-started checklist (ticket #84).
 *
 * `setup.ts` is pure, so every case is a plain `SetupFacts` value: the spec's
 * background facts, with only the fields a scenario names changed.
 */

import { expect, test } from "vitest";

import {
  setupComplete,
  setupStage,
  setupSteps,
  type SetupFacts,
  type SetupStep,
} from "../src/features/onboarding/setup";

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

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
};

// @happy: The stage follows the healthy connections

test("[happy-1] the stage names the tools with healthy connections", () => {
  const rows: [number, number, string][] = [
    [0, 0, "barebone"],
    [1, 0, "jira"],
    [0, 1, "github"],
    [1, 1, "both"],
    [3, 2, "both"],
  ];
  for (const [jira, github, stage] of rows) {
    expect(
      setupStage(
        facts({ jira: { connected: jira }, github: { connected: github } }),
      ),
    ).toBe(stage);
  }
});

test("[happy-1] the smallest positive connection count is enough to connect a tool", () => {
  expect(setupStage(facts({ jira: { connected: Number.MIN_VALUE } }))).toBe(
    "jira",
  );
  expect(
    setupStage(
      facts({
        jira: { connected: Number.MIN_VALUE },
        github: { connected: Number.MIN_VALUE },
      }),
    ),
  ).toBe("both");
});

// @boundary: Boards, repositories, proposals and bounties do not change the stage

test("[boundary-1] boards, repositories, proposals and bounties leave a Jira workspace at the jira stage", () => {
  const rows: [number, number, number, number][] = [
    [0, 0, 0, 0],
    [4, 0, 0, 0],
    [0, 7, 12, 3],
  ];
  for (const [boards, repositories, proposals, bounties] of rows) {
    expect(
      setupStage(
        facts({
          jira: { connected: 1, boards },
          github: { repositories },
          proposals,
          bounties,
        }),
      ),
    ).toBe("jira");
  }
});

test("[boundary-1] boards, repositories, proposals and bounties alone leave a workspace barebone", () => {
  expect(
    setupStage(
      facts({
        jira: { boards: 4 },
        github: { repositories: 7 },
        proposals: 12,
        bounties: 3,
      }),
    ),
  ).toBe("barebone");
});

// @boundary: GitHub repositories without a GitHub connection are not a GitHub stage

test("[boundary-2] GitHub repositories without a GitHub connection are barebone", () => {
  expect(setupStage(facts({ github: { connected: 0, repositories: 5 } }))).toBe(
    "barebone",
  );
});

test("[boundary-2] GitHub repositories without a GitHub connection do not turn a Jira workspace into both", () => {
  expect(
    setupStage(
      facts({
        jira: { connected: 1 },
        github: { connected: 0, repositories: 5 },
      }),
    ),
  ).toBe("jira");
});

// @boundary: canManage does not change the stage

test("[boundary-3] someone who cannot manage sees the both stage when both tools are connected", () => {
  expect(
    setupStage(
      facts({
        canManage: false,
        jira: { connected: 1 },
        github: { connected: 1 },
      }),
    ),
  ).toBe("both");
});

test("[boundary-3] canManage false gives the same stage as canManage true for every connection mix", () => {
  const rows: [number, number][] = [
    [0, 0],
    [1, 0],
    [0, 1],
  ];
  for (const [jira, github] of rows) {
    const change = { jira: { connected: jira }, github: { connected: github } };
    expect(setupStage(facts({ ...change, canManage: false }))).toBe(
      setupStage(facts({ ...change, canManage: true })),
    );
  }
  expect(setupStage(facts({ canManage: false }))).toBe("barebone");
});

// @boundary: Odd counts are read, not rejected

test("[boundary-4] negative, NaN and fractional connection counts are read without throwing", () => {
  const rows: [number, number, string][] = [
    [-1, 0, "barebone"],
    [Number.NaN, 0, "barebone"],
    [0, -3, "barebone"],
    [0.5, 0, "jira"],
    [Number.NaN, 1, "github"],
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

test("[boundary-4] negative zero is not positive and Infinity is", () => {
  expect(
    setupStage(facts({ jira: { connected: -0 }, github: { connected: -0 } })),
  ).toBe("barebone");
  expect(
    setupStage(
      facts({
        jira: { connected: Number.POSITIVE_INFINITY },
        github: { connected: Number.NEGATIVE_INFINITY },
      }),
    ),
  ).toBe("jira");
});

// @boundary: Negative and NaN proposal and bounty counts are not sized

test("[boundary-5] negative and NaN proposal and bounty counts leave the size step undone", () => {
  const steps = setupSteps(facts({ proposals: -1, bounties: Number.NaN }));
  expect(steps.find((step) => step.id === "size")?.done).toBe(false);
});

test("[boundary-5] a fractional bounty count sizes the workspace even beside a NaN proposal count", () => {
  const steps = setupSteps(facts({ proposals: Number.NaN, bounties: 0.5 }));
  expect(steps.find((step) => step.id === "size")?.done).toBe(true);
});

// @boundary: A tool the server does not offer has no step

test("[boundary-6] a tool the server does not offer has no step", () => {
  const rows: [boolean, boolean, string[]][] = [
    [true, true, ["jira", "github", "size"]],
    [false, true, ["github", "size"]],
    [true, false, ["jira", "size"]],
    [false, false, ["size"]],
  ];
  for (const [jiraAvailable, githubAvailable, expected] of rows) {
    expect(
      ids(
        setupSteps(
          facts({
            jira: { available: jiraAvailable },
            github: { available: githubAvailable },
          }),
        ),
      ),
    ).toEqual(expected);
  }
});

test("[boundary-6] a tool the server does not offer has no step even with a connection count", () => {
  expect(
    ids(setupSteps(facts({ jira: { available: false, connected: 2 } }))),
  ).toEqual(["github", "size"]);
  expect(
    ids(setupSteps(facts({ github: { available: false, connected: 4 } }))),
  ).toEqual(["jira", "size"]);
});

// @boundary: Someone who cannot manage the workspace is not asked to connect a tool, but sees one already connected

test("[boundary-7] someone who cannot manage sees only the steps of tools already connected, and size", () => {
  const rows: [number, number, string[]][] = [
    [0, 0, ["size"]],
    [1, 0, ["jira", "size"]],
    [0, 1, ["github", "size"]],
    [1, 1, ["jira", "github", "size"]],
  ];
  for (const [jira, github, expected] of rows) {
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
    ).toEqual(expected);
  }
});

test("[boundary-7] someone who cannot manage sees no step for a tool the server does not offer, whatever its count", () => {
  expect(
    ids(
      setupSteps(
        facts({
          canManage: false,
          jira: { available: false, connected: 1 },
          github: { available: false, connected: 1 },
        }),
      ),
    ),
  ).toEqual(["size"]);
});

// @boundary: Boards and repositories alone complete no step

test("[boundary-8] boards and repositories alone complete no step", () => {
  const steps = setupSteps(
    facts({ jira: { boards: 3 }, github: { repositories: 2 } }),
  );
  expect(ids(steps)).toEqual(["jira", "github", "size"]);
  for (const step of steps) expect(step.done).toBe(false);
});

test("[boundary-8] boards and repositories do not list a tool's step for someone who cannot manage", () => {
  expect(
    setupSteps(
      facts({
        canManage: false,
        jira: { boards: 3 },
        github: { repositories: 2 },
      }),
    ),
  ).toEqual([{ id: "size", done: false, current: true }]);
});

// @boundary: Sizing before connecting does not move current past an undone step

test("[boundary-9] sizing before connecting leaves the Jira step current", () => {
  expect(setupSteps(facts({ proposals: 4 }))).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: true, current: false },
  ]);
});

test("[boundary-9] GitHub connected and sized before Jira still leaves the Jira step current", () => {
  expect(setupSteps(facts({ proposals: 4, github: { connected: 1 } }))).toEqual(
    [
      { id: "jira", done: false, current: true },
      { id: "github", done: true, current: false },
      { id: "size", done: true, current: false },
    ],
  );
});

// @boundary: A member with nothing connected has the size step current

test("[boundary-10] a member with nothing connected has the size step current", () => {
  expect(setupSteps(facts({ canManage: false }))).toEqual([
    { id: "size", done: false, current: true },
  ]);
});

test("[boundary-10] a member with nothing connected who has sized has no current step", () => {
  expect(setupSteps(facts({ canManage: false, proposals: 1 }))).toEqual([
    { id: "size", done: true, current: false },
  ]);
});

// @boundary: Every step done leaves none current

test("[boundary-11] every step done leaves none current", () => {
  expect(
    setupSteps(
      facts({ jira: { connected: 1 }, github: { connected: 1 }, bounties: 1 }),
    ),
  ).toEqual([
    { id: "jira", done: true, current: false },
    { id: "github", done: true, current: false },
    { id: "size", done: true, current: false },
  ]);
});

test("[boundary-11] a lone size step that is done is not current", () => {
  expect(
    setupSteps(
      facts({
        jira: { available: false },
        github: { available: false },
        bounties: 1,
      }),
    ),
  ).toEqual([{ id: "size", done: true, current: false }]);
});

// @boundary: A hand-written bounty completes the size step as a proposal would

test("[boundary-12] a hand-written bounty completes setup as a proposal would", () => {
  expect(
    setupComplete(
      facts({
        jira: { connected: 1 },
        github: { connected: 1 },
        proposals: 0,
        bounties: 1,
      }),
    ),
  ).toBe(true);
});

test("[boundary-12] a member's lone size step is completed by a bounty with no proposals", () => {
  expect(
    setupComplete(facts({ canManage: false, proposals: 0, bounties: 1 })),
  ).toBe(true);
});

// @boundary: setupComplete agrees with setupSteps for any facts

const grid = (counts: number[]): SetupFacts[] => {
  const all: SetupFacts[] = [];
  for (const jiraAvailable of [true, false])
    for (const githubAvailable of [true, false])
      for (const canManage of [true, false])
        for (const jira of counts)
          for (const github of counts)
            for (const proposals of counts)
              for (const bounties of counts)
                all.push(
                  facts({
                    jira: {
                      available: jiraAvailable,
                      connected: jira,
                      broken: 1,
                    },
                    github: { available: githubAvailable, connected: github },
                    canManage,
                    proposals,
                    bounties,
                  }),
                );
  return all;
};

const expectAgreement = (value: SetupFacts) => {
  const steps = setupSteps(value);
  const complete = setupComplete(value);
  expect(complete).toBe(steps.every((step) => step.done));
  if (complete) expect(currentIds(steps)).toEqual([]);
};

test("[boundary-13] setupComplete is true exactly when every listed step is done, over ordinary counts", () => {
  for (const value of grid([0, 1, 2])) expectAgreement(value);
});

test("[boundary-13] setupComplete agrees with setupSteps over negative, NaN, fractional and infinite counts", () => {
  for (const value of grid([-1, Number.NaN, 0.5, Number.POSITIVE_INFINITY]))
    expectAgreement(value);
});

// @boundary: The facts are left as they were

test("[boundary-14] the functions leave deeply frozen facts as they were", () => {
  const value = deepFreeze(facts({ jira: { connected: 1 }, proposals: 2 }));
  const before = structuredClone(value);
  expect(() => setupStage(value)).not.toThrow();
  expect(() => setupSteps(value)).not.toThrow();
  expect(() => setupComplete(value)).not.toThrow();
  expect(value).toEqual(before);
});

test("[boundary-14] the functions leave deeply frozen facts with odd counts as they were", () => {
  const value = deepFreeze(
    facts({
      canManage: false,
      jira: { connected: Number.NaN, broken: -2 },
      github: { available: false, connected: 0.5 },
      proposals: -1,
      bounties: Number.NaN,
    }),
  );
  const before = structuredClone(value);
  expect(() => setupStage(value)).not.toThrow();
  expect(() => setupSteps(value)).not.toThrow();
  expect(() => setupComplete(value)).not.toThrow();
  expect(value).toEqual(before);
});

// @boundary: Each setupSteps call returns a new array

test("[boundary-15] each setupSteps call returns an equal but new array", () => {
  const value = facts();
  const first = setupSteps(value);
  const second = setupSteps(value);
  expect(second).toEqual(first);
  expect(second).not.toBe(first);
});

test("[boundary-15] a one-step checklist is also a new array each call", () => {
  const value = facts({ canManage: false });
  const first = setupSteps(value);
  const second = setupSteps(value);
  expect(second).toEqual(first);
  expect(second).not.toBe(first);
});

// @unhappy: Broken Jira connections do not make Jira connected

test("[unhappy-1] broken Jira connections do not make Jira connected", () => {
  const rows: [number, number, number, string][] = [
    [0, 2, 0, "barebone"],
    [0, 1, 1, "github"],
    [1, 3, 0, "jira"],
  ];
  for (const [connected, broken, github, stage] of rows) {
    expect(
      setupStage(
        facts({ jira: { connected, broken }, github: { connected: github } }),
      ),
    ).toBe(stage);
  }
});

test("[unhappy-1] many broken Jira connections beside a NaN healthy count are still barebone", () => {
  expect(
    setupStage(facts({ jira: { connected: Number.NaN, broken: 50 } })),
  ).toBe("barebone");
});

// @unhappy: available false overrides the connection count

test("[unhappy-2] a tool the server does not offer is not connected, whatever its count", () => {
  const rows: [boolean, number, boolean, number, string][] = [
    [false, 2, true, 0, "barebone"],
    [false, 2, true, 1, "github"],
    [true, 1, false, 4, "jira"],
    [false, 1, false, 1, "barebone"],
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

test("[unhappy-2] infinite connection counts for tools the server does not offer are barebone", () => {
  expect(
    setupStage(
      facts({
        jira: { available: false, connected: Number.POSITIVE_INFINITY },
        github: { available: false, connected: Number.POSITIVE_INFINITY },
      }),
    ),
  ).toBe("barebone");
});

// @unhappy: A member whose workspace has only broken Jira sites sees no Jira step

test("[unhappy-3] a member whose workspace has only broken Jira sites sees no Jira step", () => {
  expect(
    ids(
      setupSteps(
        facts({ canManage: false, jira: { connected: 0, broken: 2 } }),
      ),
    ),
  ).toEqual(["size"]);
});

test("[unhappy-3] a member with broken Jira sites and GitHub connected sees the GitHub step but no Jira step", () => {
  expect(
    ids(
      setupSteps(
        facts({
          canManage: false,
          jira: { connected: 0, broken: 2 },
          github: { connected: 1 },
        }),
      ),
    ),
  ).toEqual(["github", "size"]);
});

// @unhappy: Broken Jira sites leave the Jira step undone for a manager

test("[unhappy-4] broken Jira sites leave the Jira step undone and current for a manager", () => {
  expect(setupSteps(facts({ jira: { connected: 0, broken: 1 } }))).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: false, current: false },
  ]);
});

test("[unhappy-4] broken Jira sites keep the Jira step current after GitHub is connected", () => {
  expect(
    setupSteps(
      facts({ jira: { connected: 0, broken: 1 }, github: { connected: 1 } }),
    ),
  ).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: true, current: false },
    { id: "size", done: false, current: false },
  ]);
});

// @happy: A fresh workspace a manager can set up lists all three steps

test("[happy-2] a fresh workspace a manager can set up lists all three steps", () => {
  expect(setupSteps(facts())).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: false, current: false },
  ]);
});

test("[happy-2] a fresh workspace without Jira on offer starts at the GitHub step", () => {
  expect(setupSteps(facts({ jira: { available: false } }))).toEqual([
    { id: "github", done: false, current: true },
    { id: "size", done: false, current: false },
  ]);
});

// @happy: Each step is done on its own fact

test("[happy-3] each step is done on its own fact", () => {
  const rows: [number, number, number, number, boolean, boolean, boolean][] = [
    [0, 0, 0, 0, false, false, false],
    [1, 0, 0, 0, true, false, false],
    [0, 1, 0, 0, false, true, false],
    [0, 0, 1, 0, false, false, true],
    [0, 0, 0, 1, false, false, true],
    [2, 1, 5, 3, true, true, true],
  ];
  for (const [
    jira,
    github,
    proposals,
    bounties,
    jiraDone,
    githubDone,
    sizeDone,
  ] of rows) {
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
    ).toEqual({ jira: jiraDone, github: githubDone, size: sizeDone });
  }
});

test("[happy-3] fractional counts above zero mark their steps done", () => {
  expect(
    doneOf(
      setupSteps(
        facts({
          jira: { connected: 0.5 },
          github: { connected: 0.5 },
          proposals: 0.5,
        }),
      ),
    ),
  ).toEqual({ jira: true, github: true, size: true });
});

// @happy: current moves to the first undone step in list order

test("[happy-4] current is the first undone step in list order", () => {
  const rows: [number, number, number, string][] = [
    [0, 0, 0, "jira"],
    [1, 0, 0, "github"],
    [1, 1, 0, "size"],
    [0, 1, 0, "jira"],
    [0, 0, 1, "jira"],
    [1, 0, 1, "github"],
  ];
  for (const [jira, github, proposals, current] of rows) {
    expect(
      currentIds(
        setupSteps(
          facts({
            jira: { connected: jira },
            github: { connected: github },
            proposals,
          }),
        ),
      ),
    ).toEqual([current]);
  }
});

test("[happy-4] with Jira not on offer, current skips to the first undone listed step", () => {
  expect(
    currentIds(
      setupSteps(
        facts({ jira: { available: false }, github: { connected: 1 } }),
      ),
    ),
  ).toEqual(["size"]);
});

// @happy: Completion follows the listed steps

test("[happy-5] setupComplete is true exactly when every listed step is done", () => {
  const rows: [boolean, number, boolean, number, boolean, number, boolean][] = [
    [true, 0, true, 0, true, 0, false],
    [true, 1, true, 1, true, 0, false],
    [true, 1, true, 0, true, 1, false],
    [true, 1, true, 1, true, 1, true],
    [false, 0, false, 0, true, 1, true],
    [true, 1, false, 0, true, 1, true],
    [true, 0, true, 0, false, 1, true],
    [true, 0, true, 0, false, 0, false],
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

test("[happy-5] a member with Jira connected and something sized is complete without a GitHub step", () => {
  expect(
    setupComplete(
      facts({ canManage: false, jira: { connected: 1 }, proposals: 1 }),
    ),
  ).toBe(true);
});
