## Notes

### readStatus

- Each of the five statuses (`draft`, `review`, `published`, `claimed`, `merged`) reads as itself when already clean, e.g. `"claimed"` → `"claimed"`.
- Case is ignored and the ends are trimmed: `"Draft"` → `"draft"`, `"Merged"` → `"merged"`, `" PUBLISHED "` → `"published"`, and each status uppercased with three spaces either side (e.g. `"   REVIEW   "`) reads as that status.
- Known old spellings read as their status: `"in review"`, `"under review"`, `"reviewing"` → `"review"`; `"live"`, `"public"` → `"published"`; `"assigned"`, `"taken"` → `"claimed"`; `"done"`, `"complete"`, `"completed"` → `"merged"`.
- Old spellings are matched after cleaning, so dashes, underscores and capitals don't matter: `"In-Review"` → `"review"`, `"under_review"` → `"review"`, `"LIVE"` → `"published"`.
- Any run of spaces, `-` and `_`, even a mixed run, counts as one space: `"  Under -_ REVIEW  "` → `"review"`, `"in__--  review"` → `"review"`.
- A value that is no status returns `null` (it does not throw): `"closed"` → `null`, `"archived"` → `null`.
- Near misses return `null`, not the nearest status: `"drafts"` → `null`, `"revew"` → `null`.
- An empty value `""` and a spaces-only value `"    "` both return `null`.

### writeStatus

- Each of the five statuses is returned unchanged, e.g. `"review"` → `"review"`.
- Any other value throws an `Error` whose message contains the value exactly as given. Examples: `"Review"` (wrong case), `"in-review"`, `"closed"`.
- A status with a padded end is refused, and the message contains the value with its padding: `" draft"` throws, message contains `" draft"`.
- Old spellings are refused even when already clean, and the message contains the value: `"in review"`, `"live"`, `"done"` all throw.

### readStatuses

- Returns an object `{ rows, unreadable }`. Each input row appears in `rows` once, as `{ id, status }` with the same id and its status read the same way as `readStatus` (`null` when no status). The order of `rows` is left open.
  - Example: rows `a: "Draft"`, `b: "closed"`, `c: "In-Review"`, `d: "archived"`, `e: "merged"` give `a: "draft"`, `b: null`, `c: "review"`, `d: null`, `e: "merged"`.
- `unreadable` lists each original value that read as `null`, exactly as stored (not cleaned), once each, sorted in plain string order.
  - Example: from the rows above, `unreadable` is `["archived", "closed"]`.
  - Example: stored values `"closed"`, `"closed "`, `"closed"`, `""`, `"archived"`, `"live"` give rows that are all `null` except `"live"` → `"published"`, and `unreadable` is `["", "archived", "closed", "closed "]`. The repeated `"closed"` appears once, `"closed "` with its trailing space is listed separately, and the empty string is included and sorts first.
- An empty list of rows gives exactly `{ rows: [], unreadable: [] }`.
