/**
 * Tests for home's setup stage and getting-started checklist (ticket #84).
 *
 * The module is pure, so every behaviour is checked by calling its exports
 * with a plain `SetupFacts` value: the spec's base facts, changed only in the
 * fields a scenario names.
 */

import { expect, test } from "vitest";

import {
  setupComplete,
  setupStage,
  setupSteps,
  type SetupFacts,
  type SetupStepId,
} from "../src/features/onboarding/setup";

type Changes = {
  readonly jira?: Partial<SetupFacts["jira"]>;
  readonly github?: Partial<SetupFacts["github"]>;
  readonly proposals?: number;
  readonly bounties?: number;
  readonly canManage?: boolean;
};

/** The spec's base facts, with only the named fields changed. */
const facts = (changes: Changes = {}): SetupFacts => ({
  jira: {
    available: true,
    connected: 0,
    broken: 0,
    boards: 0,
    ...changes.jira,
  },
  github: {
    available: true,
    connected: 0,
    repositories: 0,
    ...changes.github,
  },
  proposals: changes.proposals ?? 0,
  bounties: changes.bounties ?? 0,
  canManage: changes.canManage ?? true,
});

/** The listed step ids, in order. */
const ids = (input: SetupFacts): SetupStepId[] =>
  setupSteps(input).map((step) => step.id);

/** Each listed step's done value, by id. */
const done = (input: SetupFacts): Partial<Record<SetupStepId, boolean>> =>
  Object.fromEntries(setupSteps(input).map((step) => [step.id, step.done]));

/** The ids of the steps marked current. */
const current = (input: SetupFacts): SetupStepId[] =>
  setupSteps(input)
    .filter((step) => step.current)
    .map((step) => step.id);

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

// setupStage

test("[happy-1] the stage names the tools with healthy connections", () => {
  expect(setupStage(facts())).toBe("barebone");
  expect(setupStage(facts({ jira: { connected: 1 } }))).toBe("jira");
  expect(setupStage(facts({ github: { connected: 1 } }))).toBe("github");
  expect(
    setupStage(facts({ jira: { connected: 1 }, github: { connected: 1 } })),
  ).toBe("both");
});

test("[happy-1] several connections of each tool are still the both stage", () => {
  expect(
    setupStage(facts({ jira: { connected: 3 }, github: { connected: 2 } })),
  ).toBe("both");
});

test("[boundary-1] boards, proposals and bounties leave a Jira workspace at the jira stage", () => {
  expect(setupStage(facts({ jira: { connected: 1 } }))).toBe("jira");
  expect(setupStage(facts({ jira: { connected: 1, boards: 4 } }))).toBe("jira");
  expect(
    setupStage(facts({ jira: { connected: 1 }, proposals: 12, bounties: 3 })),
  ).toBe("jira");
});

test("[boundary-1] repositories add GitHub to a Jira workspace's stage", () => {
  expect(
    setupStage(
      facts({
        jira: { connected: 1 },
        github: { repositories: 7 },
        proposals: 12,
        bounties: 3,
      }),
    ),
  ).toBe("both");
});

test("[boundary-2] repositories without a GitHub connection are the github stage", () => {
  expect(setupStage(facts({ github: { connected: 0, repositories: 5 } }))).toBe(
    "github",
  );
});

test("[boundary-2] one repository is enough for the github stage, none is not", () => {
  expect(setupStage(facts({ github: { repositories: 1 } }))).toBe("github");
  expect(setupStage(facts({ github: { repositories: 0 } }))).toBe("barebone");
});

test("[boundary-3] a member who cannot manage sees the both stage when both are connected", () => {
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

test("[boundary-3] canManage false gives every stage canManage true would", () => {
  expect(setupStage(facts({ canManage: false }))).toBe("barebone");
  expect(setupStage(facts({ canManage: false, jira: { connected: 1 } }))).toBe(
    "jira",
  );
  expect(
    setupStage(facts({ canManage: false, github: { connected: 1 } })),
  ).toBe("github");
});

test("[boundary-4] negative and NaN connection counts are read as none, without throwing", () => {
  expect(setupStage(facts({ jira: { connected: -1 } }))).toBe("barebone");
  expect(setupStage(facts({ jira: { connected: NaN } }))).toBe("barebone");
  expect(setupStage(facts({ github: { connected: -3 } }))).toBe("barebone");
});

test("[boundary-4] a fractional count above zero counts, and NaN beside a real one does not", () => {
  expect(setupStage(facts({ jira: { connected: 0.5 } }))).toBe("jira");
  expect(
    setupStage(facts({ jira: { connected: NaN }, github: { connected: 1 } })),
  ).toBe("github");
});

test("[unhappy-1] a workspace whose Jira sites are all broken is barebone", () => {
  expect(setupStage(facts({ jira: { connected: 0, broken: 2 } }))).toBe(
    "barebone",
  );
});

test("[unhappy-1] broken Jira sites neither add Jira nor take it away", () => {
  expect(
    setupStage(
      facts({ jira: { connected: 0, broken: 1 }, github: { connected: 1 } }),
    ),
  ).toBe("github");
  expect(setupStage(facts({ jira: { connected: 1, broken: 3 } }))).toBe("jira");
});

test("[unhappy-2] Jira connections count for the stage even when the server does not offer Jira", () => {
  expect(setupStage(facts({ jira: { available: false, connected: 2 } }))).toBe(
    "jira",
  );
});

test("[unhappy-2] available false on either tool never overrides its counts", () => {
  expect(
    setupStage(
      facts({
        jira: { available: false, connected: 2 },
        github: { connected: 1 },
      }),
    ),
  ).toBe("both");
  expect(
    setupStage(
      facts({
        jira: { connected: 1 },
        github: { available: false, connected: 4 },
      }),
    ),
  ).toBe("both");
  expect(
    setupStage(
      facts({
        jira: { available: false, connected: 1 },
        github: { available: false, connected: 1 },
      }),
    ),
  ).toBe("both");
  expect(
    setupStage(
      facts({ jira: { available: false }, github: { available: false } }),
    ),
  ).toBe("barebone");
});

// setupSteps: which steps, in which order

test("[happy-2] a fresh workspace lists jira, github and size with jira current", () => {
  expect(setupSteps(facts())).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: false, current: false },
  ]);
});

test("[happy-2] a fresh workspace without Jira offered starts at the github step", () => {
  expect(setupSteps(facts({ jira: { available: false } }))).toEqual([
    { id: "github", done: false, current: true },
    { id: "size", done: false, current: false },
  ]);
});

test("[boundary-6] with both tools offered every step is listed", () => {
  expect(ids(facts())).toEqual(["jira", "github", "size"]);
});

test("[boundary-6] a tool the server does not offer has no step, and size is always listed", () => {
  expect(ids(facts({ jira: { available: false } }))).toEqual([
    "github",
    "size",
  ]);
  expect(ids(facts({ github: { available: false } }))).toEqual([
    "jira",
    "size",
  ]);
  expect(
    ids(facts({ jira: { available: false }, github: { available: false } })),
  ).toEqual(["size"]);
});

test("[happy-3] at the github stage sizing comes before Jira", () => {
  expect(ids(facts({ github: { connected: 1, repositories: 0 } }))).toEqual([
    "github",
    "size",
    "jira",
  ]);
  expect(ids(facts({ github: { connected: 0, repositories: 2 } }))).toEqual([
    "github",
    "size",
    "jira",
  ]);
});

test("[happy-3] at the github stage without Jira offered the list is github, size", () => {
  expect(
    ids(
      facts({
        jira: { available: false },
        github: { connected: 1, repositories: 2 },
      }),
    ),
  ).toEqual(["github", "size"]);
});

test("[boundary-7] a member who cannot manage is listed every step", () => {
  expect(ids(facts({ canManage: false }))).toEqual(["jira", "github", "size"]);
  expect(ids(facts({ canManage: false, jira: { connected: 1 } }))).toEqual([
    "jira",
    "github",
    "size",
  ]);
});

test("[boundary-7] a member who cannot manage gets the github-stage order and the both-stage order", () => {
  expect(ids(facts({ canManage: false, github: { connected: 1 } }))).toEqual([
    "github",
    "size",
    "jira",
  ]);
  expect(
    ids(
      facts({
        canManage: false,
        jira: { connected: 1 },
        github: { connected: 1 },
      }),
    ),
  ).toEqual(["jira", "github", "size"]);
});

test("[unhappy-3] a member with only broken Jira sites still sees the Jira step, undone", () => {
  expect(
    setupSteps(facts({ canManage: false, jira: { connected: 0, broken: 2 } })),
  ).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: false, current: false },
  ]);
});

test("[unhappy-3] a member with broken Jira sites at the github stage keeps the Jira step last, undone", () => {
  expect(
    setupSteps(
      facts({
        canManage: false,
        jira: { connected: 0, broken: 2 },
        github: { connected: 1 },
      }),
    ),
  ).toEqual([
    { id: "github", done: false, current: true },
    { id: "size", done: false, current: false },
    { id: "jira", done: false, current: false },
  ]);
});

// setupSteps: done

test("[happy-4] each step is done on its own fact", () => {
  expect(done(facts())).toEqual({ jira: false, github: false, size: false });
  expect(done(facts({ jira: { connected: 1 } }))).toEqual({
    jira: true,
    github: false,
    size: false,
  });
  expect(done(facts({ github: { repositories: 1 } }))).toEqual({
    jira: false,
    github: true,
    size: false,
  });
  expect(done(facts({ proposals: 1 }))).toEqual({
    jira: false,
    github: false,
    size: true,
  });
  expect(
    done(
      facts({
        jira: { connected: 2 },
        github: { connected: 1, repositories: 4 },
        proposals: 5,
        bounties: 3,
      }),
    ),
  ).toEqual({ jira: true, github: true, size: true });
});

test("[happy-4] a GitHub connection alone or a bounty alone completes no step", () => {
  expect(done(facts({ github: { connected: 1 } }))).toEqual({
    jira: false,
    github: false,
    size: false,
  });
  expect(done(facts({ bounties: 1 }))).toEqual({
    jira: false,
    github: false,
    size: false,
  });
});

test("[boundary-5] negative proposals and NaN bounties do not size the workspace", () => {
  expect(done(facts({ proposals: -1, bounties: NaN })).size).toBe(false);
});

test("[boundary-5] NaN proposals are not sized and fractional proposals above zero are", () => {
  expect(done(facts({ proposals: NaN })).size).toBe(false);
  expect(done(facts({ proposals: 0.5 })).size).toBe(true);
});

test("[boundary-8] repositories complete the github step and boards complete none", () => {
  expect(
    setupSteps(facts({ jira: { boards: 3 }, github: { repositories: 2 } })),
  ).toEqual([
    { id: "github", done: true, current: false },
    { id: "size", done: false, current: true },
    { id: "jira", done: false, current: false },
  ]);
});

test("[boundary-8] boards alone leave the checklist as fresh", () => {
  expect(setupSteps(facts({ jira: { boards: 3 } }))).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: false, current: false },
  ]);
});

test("[unhappy-4] a broken Jira site leaves the Jira step undone for a manager", () => {
  expect(setupSteps(facts({ jira: { connected: 0, broken: 1 } }))).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: false, current: false },
  ]);
});

test("[unhappy-4] a broken Jira site is the one undone step when everything else is done", () => {
  const input = facts({
    jira: { connected: 0, broken: 1 },
    github: { repositories: 1 },
    proposals: 1,
  });
  expect(setupSteps(input)).toEqual([
    { id: "github", done: true, current: false },
    { id: "size", done: true, current: false },
    { id: "jira", done: false, current: true },
  ]);
  expect(setupComplete(input)).toBe(false);
});

// setupSteps: current

test("[happy-5] current is the first undone step in list order", () => {
  expect(current(facts())).toEqual(["jira"]);
  expect(current(facts({ jira: { connected: 1 } }))).toEqual(["github"]);
  expect(
    current(facts({ jira: { connected: 1 }, github: { connected: 1 } })),
  ).toEqual(["github"]);
  expect(
    current(facts({ jira: { connected: 1 }, github: { repositories: 1 } })),
  ).toEqual(["size"]);
});

test("[happy-5] current follows the github-stage order and skips steps done out of order", () => {
  expect(current(facts({ github: { repositories: 1 } }))).toEqual(["size"]);
  expect(
    current(facts({ github: { connected: 1, repositories: 1 }, proposals: 1 })),
  ).toEqual(["jira"]);
  expect(current(facts({ proposals: 1 }))).toEqual(["jira"]);
  expect(current(facts({ jira: { connected: 1 }, proposals: 1 }))).toEqual([
    "github",
  ]);
});

test("[boundary-9] sizing before connecting leaves jira current", () => {
  expect(setupSteps(facts({ proposals: 4 }))).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: true, current: false },
  ]);
});

test("[boundary-9] sizing after connecting Jira leaves github current", () => {
  expect(setupSteps(facts({ jira: { connected: 1 }, proposals: 4 }))).toEqual([
    { id: "jira", done: true, current: false },
    { id: "github", done: false, current: true },
    { id: "size", done: true, current: false },
  ]);
});

test("[boundary-10] a member with nothing connected has the jira step current", () => {
  expect(setupSteps(facts({ canManage: false }))).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: false, current: false },
  ]);
});

test("[boundary-10] a member who has sized but connected nothing still has jira current", () => {
  expect(setupSteps(facts({ canManage: false, proposals: 1 }))).toEqual([
    { id: "jira", done: false, current: true },
    { id: "github", done: false, current: false },
    { id: "size", done: true, current: false },
  ]);
});

test("[boundary-11] every step done leaves none current", () => {
  expect(
    setupSteps(
      facts({
        jira: { connected: 1 },
        github: { repositories: 1 },
        proposals: 1,
      }),
    ),
  ).toEqual([
    { id: "jira", done: true, current: false },
    { id: "github", done: true, current: false },
    { id: "size", done: true, current: false },
  ]);
});

test("[boundary-11] every listed step done leaves none current when Jira is not offered", () => {
  expect(
    setupSteps(
      facts({
        jira: { available: false },
        github: { repositories: 1 },
        proposals: 1,
      }),
    ),
  ).toEqual([
    { id: "github", done: true, current: false },
    { id: "size", done: true, current: false },
  ]);
});

// setupComplete

test("[happy-6] the checklist is complete only when jira, github and size are all done", () => {
  expect(setupComplete(facts())).toBe(false);
  expect(
    setupComplete(
      facts({ jira: { connected: 1 }, github: { repositories: 1 } }),
    ),
  ).toBe(false);
  expect(setupComplete(facts({ jira: { connected: 1 }, proposals: 1 }))).toBe(
    false,
  );
  expect(
    setupComplete(
      facts({
        jira: { connected: 1 },
        github: { repositories: 1 },
        proposals: 1,
      }),
    ),
  ).toBe(true);
});

test("[happy-6] completion only needs the steps listed, and ignores canManage", () => {
  expect(
    setupComplete(
      facts({
        jira: { available: false },
        github: { available: false },
        proposals: 1,
      }),
    ),
  ).toBe(true);
  expect(
    setupComplete(
      facts({
        jira: { connected: 1 },
        github: { available: false },
        proposals: 1,
      }),
    ),
  ).toBe(true);
  expect(
    setupComplete(
      facts({
        jira: { available: false },
        github: { repositories: 1 },
        proposals: 1,
      }),
    ),
  ).toBe(true);
  expect(setupComplete(facts({ canManage: false, proposals: 1 }))).toBe(false);
  expect(setupComplete(facts({ canManage: false }))).toBe(false);
});

test("[boundary-12] a GitHub connection without a repository leaves the checklist incomplete", () => {
  expect(
    setupComplete(
      facts({
        jira: { connected: 1 },
        github: { connected: 1, repositories: 0 },
        proposals: 1,
      }),
    ),
  ).toBe(false);
});

test("[boundary-12] one repository on that connection completes the checklist", () => {
  expect(
    setupComplete(
      facts({
        jira: { connected: 1 },
        github: { connected: 1, repositories: 1 },
        proposals: 1,
      }),
    ),
  ).toBe(true);
});

test("[boundary-13] a hand-written bounty does not complete the size step", () => {
  expect(
    setupComplete(
      facts({
        jira: { connected: 1 },
        github: { repositories: 1 },
        proposals: 0,
        bounties: 1,
      }),
    ),
  ).toBe(false);
});

test("[boundary-13] many bounties still do not, and one proposal does", () => {
  expect(
    setupComplete(
      facts({
        jira: { connected: 1 },
        github: { repositories: 1 },
        bounties: 100,
      }),
    ),
  ).toBe(false);
  expect(
    setupComplete(
      facts({
        jira: { connected: 1 },
        github: { repositories: 1 },
        proposals: 1,
      }),
    ),
  ).toBe(true);
});

const agreeWithSteps = (input: SetupFacts) => {
  const steps = setupSteps(input);
  const complete = setupComplete(input);
  expect(complete).toBe(steps.every((step) => step.done));
  if (complete) expect(steps.some((step) => step.current)).toBe(false);
};

test("[boundary-14] setupComplete agrees with setupSteps across ordinary facts", () => {
  for (const jira of [0, 1]) {
    for (const repositories of [0, 1]) {
      for (const connected of [0, 1]) {
        for (const proposals of [0, 1]) {
          agreeWithSteps(
            facts({
              jira: { connected: jira },
              github: { connected, repositories },
              proposals,
            }),
          );
        }
      }
    }
  }
});

test("[boundary-14] setupComplete agrees with setupSteps for odd counts and unoffered tools", () => {
  agreeWithSteps(
    facts({
      jira: { available: false, connected: NaN, broken: -1, boards: 0.5 },
      github: { available: false, connected: -2, repositories: NaN },
      proposals: 0.5,
      bounties: -4,
      canManage: false,
    }),
  );
  agreeWithSteps(
    facts({
      jira: { connected: -1 },
      github: { available: false, repositories: 3 },
      proposals: NaN,
    }),
  );
  agreeWithSteps(
    facts({
      jira: { available: false, connected: 0.5 },
      github: { connected: NaN, repositories: 0.5 },
      proposals: 2,
    }),
  );
});

// Purity

test("[boundary-15] the facts are left as they were", () => {
  const input = deepFreeze(facts({ jira: { connected: 1 }, proposals: 2 }));
  const before = facts({ jira: { connected: 1 }, proposals: 2 });
  expect(() => setupStage(input)).not.toThrow();
  expect(() => setupSteps(input)).not.toThrow();
  expect(() => setupComplete(input)).not.toThrow();
  expect(input).toEqual(before);
});

test("[boundary-15] frozen facts with odd counts and unoffered tools are left as they were", () => {
  const changes: Changes = {
    jira: { available: false, connected: NaN, broken: -1, boards: 2 },
    github: { available: false, connected: -3, repositories: 0.5 },
    proposals: NaN,
    bounties: -1,
    canManage: false,
  };
  const input = deepFreeze(facts(changes));
  expect(() => setupStage(input)).not.toThrow();
  expect(() => setupSteps(input)).not.toThrow();
  expect(() => setupComplete(input)).not.toThrow();
  expect(input).toEqual(facts(changes));
});

test("[boundary-16] each setupSteps call returns a new, equal array", () => {
  const input = facts();
  const first = setupSteps(input);
  const second = setupSteps(input);
  expect(second).toEqual(first);
  expect(second).not.toBe(first);
});

test("[boundary-16] equal facts in separate objects give equal, separate arrays, even of one step", () => {
  const changes: Changes = {
    jira: { available: false },
    github: { available: false },
    proposals: 1,
  };
  const first = setupSteps(facts(changes));
  const second = setupSteps(facts(changes));
  expect(second).toEqual(first);
  expect(second).not.toBe(first);
});
