# feat: attest the deployed image and report its digest at /version (#43)



## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `apps/api/src/image-digest.ts`:

```ts
export async function resolveImageDigest(env: NodeJS.ProcessEnv = process.env): Promise<string | undefined>;
```
