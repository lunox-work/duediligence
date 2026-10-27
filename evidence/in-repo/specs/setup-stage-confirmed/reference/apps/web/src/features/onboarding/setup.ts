/**
 * Which home a workspace sees, and what the getting-started checklist above
 * it says, from what the workspace has connected. Pure: `useWorkspaceSetup`
 * gathers the facts and passes them in; this module only reads them.
 */

/** Which tools count for the workspace's home: neither, Jira, GitHub or both. */
export type SetupStage = "barebone" | "jira" | "github" | "both";

/** What the workspace has connected, as `useWorkspaceSetup` gathers it. */
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

/** The stage the facts put the workspace at: which tools count for it. */
export function setupStage(facts: SetupFacts): SetupStage {
  const jira = positive(facts.jira.connected);
  const github =
    positive(facts.github.connected) || positive(facts.github.repositories);
  if (jira && github) return "both";
  if (jira) return "jira";
  if (github) return "github";
  return "barebone";
}

/** Whether a count is above zero; negative numbers and `NaN` are not. */
function positive(count: number): boolean {
  return count > 0;
}

/** A step of the getting-started checklist. */
export type SetupStepId = "jira" | "github" | "size";

/** One listed checklist step: whether its outcome holds, and whether it is the one to do next. */
export interface SetupStep {
  readonly id: SetupStepId;
  readonly done: boolean;
  readonly current: boolean;
}

/** The checklist's offered steps, in order, as a new array on every call. */
export function setupSteps(facts: SetupFacts): SetupStep[] {
  const done: Record<SetupStepId, boolean> = {
    jira: positive(facts.jira.connected),
    github: positive(facts.github.repositories),
    size: positive(facts.proposals),
  };
  const offered: Record<SetupStepId, boolean> = {
    jira: facts.jira.available,
    github: facts.github.available,
    size: true,
  };
  const order: readonly SetupStepId[] =
    setupStage(facts) === "github"
      ? ["github", "size", "jira"]
      : ["jira", "github", "size"];
  const ids = order.filter((id) => offered[id]);
  const current = ids.find((id) => !done[id]);
  return ids.map((id) => ({ id, done: done[id], current: id === current }));
}

/** Whether every step `setupSteps` lists for the same facts is done. */
export function setupComplete(facts: SetupFacts): boolean {
  return setupSteps(facts).every((step) => step.done);
}
