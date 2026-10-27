# feat(bounties): edit a bounty's scope, hold steps for approval, and pin repository builds as context (#95)

## feat(bounties): hold each step until the steps before it are approved

A step can now be changed only once every step before it is approved.
The price waits on the scope, and the sandbox waits on both. The new
`stepHeldBy` and `stepHeldReason` in core decide this, so the API and
the page refuse with the same words. Going back is never held:
unapproving, removing and unpublishing still work.

- API: pricing (start a run, approve, resize, rubric, respec, reprice)
  and sandbox routes (create, link source, generate, add, change,
  publish, rebuild versions) answer 409 `step_held` with `heldBy` while
  an earlier step is not approved.
- Web: a held step's tab shows a lock and gives the reason in its
  tooltip, and its page opens with a "Locked." banner that links to the
  step holding it. Its actions (Price it, Re-analyze, resize, approve,
  rubric, analyze spec, Create sandbox, Link repo, Publish) are disabled
  and give the reason on hover. The sandbox's generation and publish
  menu use the same reason in place of the old proposal-status checks.

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `packages/core/src/stages.ts`:

```ts
export function stepHeldBy(step: "price" | "sandbox", bounty: {
    readonly version: number;
    readonly approval: {
        readonly version: number;
    } | null;
}, proposal: {
    readonly status: string;
} | null): "scope" | "price" | null;

export function stepHeldReason(step: "price" | "sandbox", heldBy: "scope" | "price"): string;
```
