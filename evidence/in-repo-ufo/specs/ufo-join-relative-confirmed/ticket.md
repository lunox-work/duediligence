# feat: `joinRelativeURL` (#220)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `src/utils.ts`:

```ts
export function joinURL(base: string, ...input: string[]): string;

export function joinRelativeURL(..._input: string[]): string;
```
