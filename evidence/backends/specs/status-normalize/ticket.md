# Add a sandbox status enum

Context
Sandbox status is stored as free text (draft, Draft, in-review...), so filters miss tasks.

Change
Introduce a status enum with draft, review, published, claimed, merged and use it where the status is set.

Acceptance criteria

- Only enum values are written
- Existing values are normalised when read

Scope
The status module in `src/index.ts`.
