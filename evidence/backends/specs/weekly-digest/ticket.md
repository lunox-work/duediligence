# Weekly digest of open bounties and their gate status

Context
Engineering leads lose track of posted tasks that have stalled.

Change
Send a Monday email listing each open task with its age, submissions and the furthest gate reached.

Acceptance criteria

- Tasks with no submissions for 14 days are flagged
- Digest is skipped when nothing is open

Scope
Building the digest in `src/index.ts`; sending the email is a separate task.
