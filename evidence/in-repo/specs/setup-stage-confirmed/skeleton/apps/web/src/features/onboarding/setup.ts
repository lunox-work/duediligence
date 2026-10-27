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
export function setupStage(_facts: SetupFacts): SetupStage {
  throw new Error("not implemented");
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
export function setupSteps(_facts: SetupFacts): SetupStep[] {
  throw new Error("not implemented");
}

/** Whether every step `setupSteps` lists for the same facts is done. */
export function setupComplete(_facts: SetupFacts): boolean {
  throw new Error("not implemented");
}
