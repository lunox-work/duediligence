# Invite codes for invite-only tasks

Context
Company-borne tasks are invite only, and beta needs a way to invite contributors.

Change
Generate single-use invite codes per task; redeeming one grants access to that task.

Acceptance criteria

- Codes are single-use and expire after 14 days
- Redeemed codes show who used them

Scope
Task access only, in `src/index.ts`. Contributor accounts are unchanged.
