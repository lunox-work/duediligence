# feat(utils): add `reverseResolveAlias` util (#173)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `src/utils.ts`:

```ts
export function reverseResolveAlias(path: string, aliases: Record<string, string>): string[];
```
