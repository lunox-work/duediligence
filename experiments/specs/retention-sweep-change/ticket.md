# Count regional minimums from creation, not from last access
## Context
Regional minimums are legal floors measured from when we collected a record. For access-based categories the sweep counts them from the last access, so an EU record opened last week is held for another full minimum, well past what the law requires and what our privacy notice promises.
## Change
A region's minimum should always count from the record's created date. The category's own period keeps counting from the last access where the policy says so.
## Acceptance criteria
- An access-based record in a region with a minimum expires once both its category period since last access and its regional minimum since creation have passed.
- Creation-based categories, and records in regions with no minimum, are decided exactly as today.
## Scope
Only how the regional minimum is counted. Holds, parents, the length of the grace period and the error cases do not change.
