# feat: faster flows, phases 0–4 (#104)

- A Jira site's field list is kept for an hour. A proposal's page and the
  context's status read an issue at most once a minute; approvals still
  read it live.

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `apps/api/src/jira/recent.ts`:

```ts
export const RECENT_JIRA_READ_MS = 60000;

export interface RecentReads<T> {
    get(key: string): T | undefined;
    set(key: string, value: T): void;
}

export function recentReads<T>(options: {
    ttlMs?: number;
    now?: () => number;
    max?: number;
} = {}): RecentReads<T>;

export function issueKey(organizationId: string, connectionId: string, issueId: string): string;
```
