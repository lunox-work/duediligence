# feat(jira): read a ticket's spec and fingerprint it (#27)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/jira/src/spec.ts`:

```ts
export interface JiraIssueSpec {
    readonly key: string;
    readonly summary: string;
    readonly descriptionText: string;
    readonly issueType: string;
    readonly updated: string | null;
    readonly specHash: string;
}

export const SPEC_FIELDS: readonly string[] = [
    "summary",
    "description",
    "issuetype",
    "updated",
];

export async function specHash(summary: string, descriptionText: string): Promise<string>;

export async function toIssueSpec(key: string, fields: {
    summary?: unknown;
    description?: unknown;
    issuetype?: {
        name?: unknown;
    } | null;
    updated?: unknown;
}): Promise<JiraIssueSpec>;
```
