# feat: add `filterQuery` utility (#287)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `src/utils.ts`:

```ts
export function filterQuery(input: string, predicate: (key: string, value: string | string[]) => boolean): string;
```
