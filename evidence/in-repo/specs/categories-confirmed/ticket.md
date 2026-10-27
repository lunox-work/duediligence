# feat(bounties): select tickets by category and browse proposals by category (#64)

## feat(bounties): size every ticket that fits a category, with the reason

A backlog run took the ten oldest tickets. It now reads the whole board and
sizes every open ticket that fits at least one outsourcing category, and
records why each was picked.

Categories are one registry in packages/core/src/selection: Left behind,
Always next sprint, Quietly wanted, Holding others up, Paper cuts and
Deadline exposed. Each is an id, a label, default thresholds and a rule
built from named signals, so a criterion or a category changes in one
place. The board settings schema is generated from the registry, and a
board can override any threshold or switch a category off.

- Selection reads /board/{id}/issue for every board type, asking for
  sprint history, votes, watchers, links and fix versions, and classifies
  in code. The backlog endpoint hides tickets in a sprint, which are what
  "Always next sprint" looks for. Still no description in a list read.
- The reason is stored on the run's plan and shown on proposal rows, in
  the sizing list, and in the peek under "Why this ticket".
- maxTickets and excludeAssigned become ticketCap (optional, no default)
  and unassignedOnly (default false). Renamed rather than re-defaulted:
  registration stored the old defaults on existing boards, which would
  have kept them capped at ten.
- A run's deadline grows with its plan, and recorded outcomes are bounded
  by the plan rather than a fixed 50.
- Board settings merge category by category and threshold by threshold,
  and a null in an update removes the setting instead of being stored.
- The proposal list pages 50 at a time with "Show more", and title
  streams are split into batches the route accepts.

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/core/src/selection/facts.ts`:

```ts
export interface SelectionLink {
    readonly type: string;
    readonly direction: "inward" | "outward";
    readonly statusCategory: string;
}

export interface SelectionClosedSprint {
    readonly startDate: string | null;
    readonly endDate: string | null;
}

export interface SelectionRelease {
    readonly name: string;
    readonly releaseDate: string | null;
    readonly released: boolean;
}

export interface SelectionIssue {
    readonly assignee: string | null;
    readonly priority: string | null;
    readonly issueType: string;
    readonly created: string | null;
    readonly updated: string | null;
    readonly dueDate: string | null;
    readonly sprint: {
        readonly state: string;
    } | null;
    readonly closedSprints: readonly SelectionClosedSprint[];
    readonly votes: number | null;
    readonly watchers: number | null;
    readonly commentCount?: number | null;
    readonly links: readonly SelectionLink[];
    readonly releases: readonly SelectionRelease[];
}

export type PriorityRank = "low" | "medium" | "high" | "none";

export interface IssueFacts {
    readonly ageDays: number;
    readonly daysSinceUpdate: number;
    readonly assigned: boolean;
    readonly inSprint: boolean;
    readonly closedSprintCount: number;
    readonly carriedSince: string | null;
    readonly votes: number;
    readonly watchers: number;
    readonly duplicateLinks: number;
    readonly blocksOpenCount: number;
    readonly commentCount: number | null;
    readonly priorityName: string | null;
    readonly priorityRank: PriorityRank;
    readonly isBug: boolean;
    readonly dueInDays: number | null;
    readonly release: {
        readonly name: string;
        readonly inDays: number;
    } | null;
}

export const PRIORITY_RANKS: Readonly<Record<string, PriorityRank>> = …;

export const BUG_ISSUE_TYPES: readonly string[] = ["bug", "defect"];

export function factsFor(issue: SelectionIssue, now: Date): IssueFacts;
```

In `packages/core/src/selection/rules.ts`:

```ts
export interface Signal {
    readonly id: string;
    readonly test: (facts: IssueFacts) => boolean;
    readonly describe: (facts: IssueFacts) => string | null;
}

export type Rule = Signal | {
    readonly all: readonly Rule[];
} | {
    readonly any: readonly Rule[];
};

export function all(...rules: Rule[]): Rule;

export function any(...rules: Rule[]): Rule;

export function silent(signal: Signal): Signal;

export function signal(id: string, test: Signal["test"], describe: Signal["describe"]): Signal;

export interface Evaluation {
    readonly matched: boolean;
    readonly clauses: readonly string[];
}

export function evaluate(rule: Rule, facts: IssueFacts): Evaluation;
```

In `packages/core/src/selection/signals.ts`:

```ts
export const unassigned: Signal = …;

export const neverInSprint: Signal = …;

export const notInSprint: Signal = …;

export const bug: Signal = …;

export function openAtLeast(days: number): Signal;

export function quietAtLeast(days: number): Signal;

export function carriedAtLeast(sprints: number): Signal;

export function votesAtLeast(votes: number): Signal;

export function watchersAtLeast(watchers: number): Signal;

export function duplicatesAtLeast(links: number): Signal;

export function commentsAtLeast(comments: number): Signal;

export function blocksAtLeast(tickets: number): Signal;

export function priorityAtMost(rank: "low" | "medium"): Signal;

export function deadlineWithin(days: number): Signal;
```

In `packages/core/src/selection/categories.ts`:

```ts
export type Thresholds = Readonly<Record<string, number>>;

export interface Category {
    readonly id: string;
    readonly label: string;
    readonly why: string;
    readonly defaults: Thresholds;
    readonly rule: (thresholds: Thresholds) => Rule;
}

export const CATEGORIES: readonly Category[] = …;

export const UNCATEGORIZED = "uncategorized";

export interface CategorySettings {
    readonly enabled?: boolean | undefined;
    readonly thresholds?: Readonly<Record<string, number | null | undefined>> | undefined;
}

export type CategoryConfig = Readonly<Record<string, CategorySettings | undefined>>;

export interface ResolvedCategory {
    readonly id: string;
    readonly label: string;
    readonly why: string;
    readonly enabled: boolean;
    readonly thresholds: Thresholds;
}

export interface CategoryMatch {
    readonly id: string;
    readonly label: string;
    readonly reason: string;
}

export function resolveCategories(config: CategoryConfig = {}, categories: readonly Category[] = CATEGORIES): ResolvedCategory[];

export function createClassifier(config: CategoryConfig = {}, categories: readonly Category[] = CATEGORIES): (facts: IssueFacts) => CategoryMatch[];

export function classify(facts: IssueFacts, config: CategoryConfig = {}, categories: readonly Category[] = CATEGORIES): CategoryMatch[];
```
