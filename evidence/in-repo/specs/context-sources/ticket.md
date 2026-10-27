# feat(bounties): sync Jira and repository context into bounties, versioned per source (#80)

## feat(bounties): sync Jira and repository context into bounties, versioned per source

A person can sync a bounty's sources into it as context: its Jira
issue's fields beyond its text (type, status, priority, labels,
components, releases, story points, estimates, demand and links), and
its repository's own documents (README, guides and docs, never code),
read at the newest snapshot and cut to fixed caps
(`packages/core/src/sources.ts`).

Each sync that finds something new is the source's next version in
`bounty_context`; one that finds the same content only moves the
version's revision and check time. The overview holds the latest
version from each source still linked. Sizing and spec drafting are
shown it (`draft-v5`, `jira-size-v4`) and the proposal records the
versions it used; a sandbox version freezes it into its approved task,
which the starter agent is shown (`sandbox_starter@3`), and records the
versions beside it.

- `GET .../bounties/:id/context` says where each source stands:
  unlinked, unsynced, current, ahead of its sync, or unavailable.
- `POST .../bounties/:id/context/{jira,github}/sync` reads the source
  now; a Jira sync takes the issue's text too.

The web bounty page shows each source's sync under its link, warns when
a source has moved past it, and marks the bounty and sandbox steps made
with older context than the overview holds.

Migration 0056 adds `bounty_context` and the context version columns on
`bounty_proposal` and `sandbox_version_source`.

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/core/src/sources.ts`:

```ts
export const CONTEXT_SOURCES = ["jira", "github"] as const;

export type ContextSource = (typeof CONTEXT_SOURCES)[number];

export interface JiraIssueLinkContext {
    readonly type: string;
    readonly direction: "inward" | "outward";
    readonly key: string | null;
    readonly done: boolean;
}

export interface JiraContext {
    readonly key: string;
    readonly issueType: string | null;
    readonly status: string | null;
    readonly statusCategory: string | null;
    readonly priority: string | null;
    readonly labels: readonly string[];
    readonly components: readonly string[];
    readonly fixVersions: readonly string[];
    readonly parentKey: string | null;
    readonly dueDate: string | null;
    readonly storyPoints: number | null;
    readonly originalEstimateSeconds: number | null;
    readonly remainingEstimateSeconds: number | null;
    readonly votes: number | null;
    readonly watchers: number | null;
    readonly subtaskCount: number;
    readonly links: readonly JiraIssueLinkContext[];
    readonly updated: string | null;
}

export interface GithubContextDocument {
    readonly path: string;
    readonly bytes: number;
    readonly text: string;
    readonly truncated: boolean;
}

export interface GithubContext {
    readonly fullName: string;
    readonly branch: string;
    readonly commitSha: string;
    readonly documents: readonly GithubContextDocument[];
    readonly omitted: number;
}

export interface ContextVersions {
    readonly jira: number | null;
    readonly github: number | null;
}

export const NO_CONTEXT: ContextVersions = …;

export const CONTEXT_DOCUMENTS_MAX = 12;

export const CONTEXT_DOCUMENT_BYTES_MAX = …;

export const CONTEXT_DOCUMENT_CHARS = 12000;

export const CONTEXT_TOTAL_CHARS = 48000;

export function contextKeywords(title: string): string[];

export function contextDocuments(files: readonly {
    readonly path: string;
    readonly size: number;
}[], keywords: readonly string[] = []): {
    readonly paths: string[];
    readonly omitted: number;
};

export function keptDocuments(documents: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly text: string;
}[]): {
    readonly documents: GithubContextDocument[];
    readonly omitted: number;
};

export function jiraContextFields(context: JiraContext): Record<string, unknown>;

export function renderSourceContext(context: {
    readonly jira: JiraContext | null;
    readonly github: GithubContext | null;
}): string;

export function contextDrift(current: ContextVersions, used: ContextVersions): {
    readonly jira: StageDrift | null;
    readonly github: StageDrift | null;
};
```
