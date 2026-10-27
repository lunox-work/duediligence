# feat: faster flows, phases 0–4 (#104)

- At most two evaluation jobs run at once on a worker (limitJobs).

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `apps/worker/src/evaluation/limit.ts`:

```ts
export const EVALUATION_JOBS_MAX = 2;

export function limitJobs(provider: EvaluationProvider, max: number): EvaluationProvider;
```
