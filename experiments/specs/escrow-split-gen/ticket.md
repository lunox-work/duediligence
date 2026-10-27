# Release the escrow in two parts

Release 75% of the escrow when hidden tests pass

Context
Gate 2 marks the submission as passed but the escrow stays fully locked until merge.

Change
When the hidden test run passes, record a partial release of the configured hidden-test share (default 75%) to the contributor.

Acceptance criteria

- Release happens once per task
- Amount is derived from the bounty, never hard-coded
- A failed run releases nothing

Release the remaining escrow on UAT approval

Context
After Gate 3 the remaining share of the bounty is not released automatically.

Change
When the maintainer approves UAT on the merge-back PR, release the remaining escrow balance.

Acceptance criteria

- Remaining balance is released exactly once
- Task shows the bounty as fully released

Scope
The release logic in `src/index.ts`.
