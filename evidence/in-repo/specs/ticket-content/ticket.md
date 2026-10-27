# feat(tickets): support native tickets and repository complexity profiles (#76)

## feat(tickets): write tickets here and propose them without Jira

- pricingSpecHash is ticketSpecHash itself; the ticket limits, default
  type, schema version, graph deadline and paging helpers have one
  definition each.

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/core/src/ticket.ts`:

```ts
export const TICKET_ORIGINS = ["manual", "jira"] as const;

export type TicketOrigin = (typeof TICKET_ORIGINS)[number];

export const TICKET_LIMITS = …;

export const DEFAULT_ISSUE_TYPE = "Task";

export function clampTicketTitle(title: string): string;

export interface TicketContent {
    readonly title: string;
    readonly description: string;
    readonly issueType: string;
    readonly priority: string | null;
    readonly labels: readonly string[];
    readonly components: readonly string[];
    readonly inputTruncated: boolean;
}

export const TICKET_SPEC_HASH_VERSION = 1;

export async function ticketSpecHash(title: string, description: string, issueType: string): Promise<string>;

export function normalizeSpecText(value: string): string;

export function ticketKey(ticket: {
    readonly number: number;
    readonly jiraKey?: string | null | undefined;
}): string;
```
