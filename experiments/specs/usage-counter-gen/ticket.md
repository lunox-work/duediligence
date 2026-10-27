# Per-task token usage counter

Context
Token spend has to be metered per task for both payment modes, and nothing counts it yet.

Change
Add a counter that sums input and output tokens and cost per task from each model call.

Acceptance criteria

- Totals are per task and per contributor
- Counter survives restarts

Scope
The counter in `src/index.ts`, over the store interface it is given.
