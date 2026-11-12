# feat(jira): add a second Atlassian app for connecting a client's site (#30)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `apps/api/src/env.ts`:

```ts
export function jiraOAuthConfig(env: Env): {
    clientId: string;
    clientSecret: string;
} | undefined;
```

In `apps/api/src/jira/state.ts`:

```ts
export interface JiraOAuthState {
    readonly organizationId: string;
    readonly userId: string;
    readonly returnTo: string;
    readonly issuedAt: number;
    readonly nonce: string;
}

export type StateFailure = "malformed" | "bad-signature" | "expired" | "wrong-user";

export type StateResult = {
    ok: true;
    state: JiraOAuthState;
} | {
    ok: false;
    reason: StateFailure;
};

export function signState(secret: string, state: Omit<JiraOAuthState, "issuedAt" | "nonce"> & Partial<Pick<JiraOAuthState, "issuedAt" | "nonce">>): string;

export function verifyState(secret: string, value: string | undefined, expectedUserId: string, now: number = Date.now()): StateResult;
```
