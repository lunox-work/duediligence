# feat(organizations): add organizations with handles, membership and roles (#24)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/core/src/handle.ts`:

```ts
export const HANDLE_MIN_LENGTH = 3;

export const HANDLE_MAX_LENGTH = 30;

export type HandleProblem = "length" | "charset";

export interface HandleRejected {
    readonly status: "invalid";
    readonly problem: HandleProblem;
    readonly reason: string;
}

export type HandleCheck = {
    readonly status: "ok";
} | HandleRejected;

export function toHandleCase(raw: string): string;

export function checkHandle(handle: string): HandleCheck;

export type NormalizedHandle = {
    readonly status: "ok";
    readonly handle: string;
    readonly display: string;
} | HandleRejected;

export function normalizeHandle(raw: string): NormalizedHandle;

export function isValidHandle(raw: string): boolean;

export function toHandleStem(text: string): string;

export function handleStemFromEmail(email: string): string;
```
