/**
 * Which home a workspace sees and what the getting-started checklist above
 * it says, decided from what the workspace has connected (ticket #84).
 * Pure: `useWorkspaceSetup` gathers the facts and passes them in.
 */

/** Which home to show: the tools that are connected, or neither. */
export type SetupStage = "barebone" | "jira" | "github" | "both";

/** What a workspace has connected and sized, as `useWorkspaceSetup` reads it. */
export interface SetupFacts {
  readonly jira: {
    /** The server offers Jira at all. */
    readonly available: boolean;
    /** Healthy Jira connections. */
    readonly connected: number;
    /** Unhealthy ones (need reconnecting). */
    readonly broken: number;
    /** Registered boards. */
    readonly boards: number;
  };
  readonly github: {
    /** The server has a GitHub App configured. */
    readonly available: boolean;
    /** GitHub connections (installations). */
    readonly connected: number;
    /** Registered repositories. */
    readonly repositories: number;
  };
  /** Proposals in the workspace. */
  readonly proposals: number;
  /** Bounties in the workspace. */
  readonly bounties: number;
  /** The person is an owner or admin. */
  readonly canManage: boolean;
}

/** The stage names the tools that are connected: neither, Jira, GitHub or both. */
export function setupStage(facts: SetupFacts): SetupStage {
  const jira = jiraConnected(facts);
  const github = githubConnected(facts);
  if (jira && github) return "both";
  if (jira) return "jira";
  if (github) return "github";
  return "barebone";
}

/** A step of the getting-started checklist. */
export type SetupStepId = "jira" | "github" | "size";

/** One checklist step: whether its outcome holds, and whether it is the one to do next. */
export interface SetupStep {
  readonly id: SetupStepId;
  readonly done: boolean;
  readonly current: boolean;
}

/** The checklist, in the fixed order jira, github, size, leaving out the steps that do not apply. Returns a new array on every call. */
export function setupSteps(facts: SetupFacts): SetupStep[] {
  const listed: { id: SetupStepId; done: boolean }[] = [];
  const jira = jiraConnected(facts);
  if (facts.jira.available && (jira || facts.canManage)) {
    listed.push({ id: "jira", done: jira });
  }
  const github = githubConnected(facts);
  if (facts.github.available && (github || facts.canManage)) {
    listed.push({ id: "github", done: github });
  }
  listed.push({
    id: "size",
    done: positive(facts.proposals) || positive(facts.bounties),
  });
  const current = listed.findIndex((step) => !step.done);
  return listed.map((step, index) => ({ ...step, current: index === current }));
}

/** Whether every step `setupSteps` lists for the same facts is done. */
export function setupComplete(facts: SetupFacts): boolean {
  return setupSteps(facts).every((step) => step.done);
}

/** A count is positive only when it is greater than zero; `NaN` and negatives are not. */
function positive(count: number): boolean {
  return count > 0;
}

/** Jira counts as connected only when the server offers it and a healthy connection exists. */
function jiraConnected(facts: SetupFacts): boolean {
  return facts.jira.available && positive(facts.jira.connected);
}

/** GitHub counts as connected only when the server offers it and an installation exists. */
function githubConnected(facts: SetupFacts): boolean {
  return facts.github.available && positive(facts.github.connected);
}
