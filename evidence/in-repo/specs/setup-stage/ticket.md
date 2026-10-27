# feat(onboarding): connecting Jira sizes nothing; home shows the free category scan (#84)

## feat(web): home adapts to what a workspace has connected

Home is one page that changes with the workspace, decided in
`features/onboarding/setup.ts` from facts `useWorkspaceSetup` reads
through the cache keys the pages it summarises already use:

- Nothing connected: three ways in (Jira, GitHub, write a bounty) over a
  showcase of the six categories, each with what it looks for.
- Jira: the board, opening on its backlog scan. Tickets are sorted into
  the categories for free, and the one in focus is shown as the bounty it
  would become, with one button to size it. Sizing the whole board is
  offered with its cost said first.
- GitHub: the repository's x-ray, with the modules a first bounty is
  easiest to cut from; writing one there opens the new-bounty page on that
  repository and module (`?repo=&area=`, checked against the workspace's
  own list).

A getting-started checklist sits above every stage until it is done or
hidden. The scan is also the board page's first view until the board has
proposals, then folds to one line above them. Nothing on home makes a
model call by itself.

`useConnections` is gone; `useJira` reports a server without Jira as not
offered rather than as a failure.

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `apps/web/src/features/onboarding/setup.ts`:

```ts
export type SetupStage = "barebone" | "jira" | "github" | "both";

export interface SetupFacts {
    readonly jira: {
        readonly available: boolean;
        readonly connected: number;
        readonly broken: number;
        readonly boards: number;
    };
    readonly github: {
        readonly available: boolean;
        readonly connected: number;
        readonly repositories: number;
    };
    readonly proposals: number;
    readonly bounties: number;
    readonly canManage: boolean;
}

export function setupStage(facts: SetupFacts): SetupStage;

export type SetupStepId = "jira" | "github" | "size";

export interface SetupStep {
    readonly id: SetupStepId;
    readonly done: boolean;
    readonly current: boolean;
}

export function setupSteps(facts: SetupFacts): SetupStep[];

export function setupComplete(facts: SetupFacts): boolean;
```
