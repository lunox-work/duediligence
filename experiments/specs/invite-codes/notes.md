## Notes

### Creating a code

- A code is exactly 8 characters, each one from the alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789` (uppercase letters without I, L, O, U, plus the digits 2–9).
- `create(taskId)` resolves to an `InviteCode` with that `taskId`, state `"unused"`, `createdAt` equal to the clock's current time, and `expiresAt` exactly 14 days (to the millisecond) later. With the clock at `2026-03-01T09:00:00.000Z`, `createdAt` is `2026-03-01T09:00:00.000Z` and `expiresAt` is `2026-03-15T09:00:00.000Z`. Both are `Date` objects.
- A newly created code has `usedBy` and `usedAt` both `undefined`.
- The code is decided only by the injected random source. Two registries fed the same sequence of random values produce the same code. Feeding the values 0,1,…,7 and feeding 8,9,…,15 must produce two different codes, and both must be valid codes.
- Each attempt to draw a code uses exactly eight values from the random source, and `create` takes no other random values. The repeat rule below depends on this.
- If a drawn code is already in the registry, under any task, `create` throws it away and draws again from the next eight random values. Example: the source returns 0–7, then 0–7 again, then 8–15. The first `create("t1")` gets the code for 0–7. The second `create("t2")` draws that same code again, discards it, and returns the code a fresh registry would make from 8–15. Both codes can then be redeemed, and each grants its own task (`t1` and `t2`).
- A created code shows up straight away in `list` for its task as `"unused"` with the same `expiresAt`.

### Redeeming a code

- `redeem(code, contributorId)` on an unused, unexpired code resolves to `{ ok: true, taskId }` for the code's task. After that, `hasAccess(contributorId, taskId)` is `true` and `tasksFor(contributorId)` is `["t1"]`.
- Redeeming marks the code `"used"`, with `usedBy` set to the contributor and `usedAt` set to the clock time at redemption. Example: redeemed at `2026-03-04T12:30:00Z`, `usedAt` is `2026-03-04T12:30:00.000Z`.
- Redeeming grants access to that one task for that one contributor only. If c1 redeems a `t1` code, `hasAccess("c1","t2")` is `false`, `hasAccess("c2","t1")` is `false` and `tasksFor("c2")` is `[]`.
- Before lookup, the input is normalised: a code typed in lowercase, with spaces around it or inside it (e.g. `" ABCD EFGH "`), or with a dash (e.g. `"ABCD-EFGH"`) counts as the same code. The redemption succeeds, `list` shows the code under its normal uppercase 8-character form with the right `usedBy`, and a later redeem of the plain code by someone else fails with `"used"`.
- A code that was never created, e.g. `"ZZZZZZZZ"`, fails with `{ ok: false, reason: "unknown" }` and grants nothing (`tasksFor` is `[]`).
- A code can be redeemed up to 1 ms before `expiresAt`. Created at `2026-03-01T09:00:00Z`, it still works at `2026-03-15T08:59:59.999Z` and grants access.
- At exactly `expiresAt` or later, an unused code fails with reason `"expired"`. Example: `2026-03-15T09:00:00Z` for the code above. No access is granted: `hasAccess` is `false` and `tasksFor` is `[]`.
- A code used by one contributor fails for any other contributor with reason `"used"`. That contributor gets no access (`hasAccess` `false`, `tasksFor` `[]`), and the code's `usedBy` still shows the first contributor.
- If the contributor who used a code redeems it again, even at a later time, the result is success `{ ok: true, taskId }` and nothing changes. The code stays `"used"` with the original `usedBy` and original `usedAt`, `tasksFor` is still `["t1"]` (no duplicate), and the task still lists only one code.
- A revoked code fails with reason `"revoked"` and grants no access.
- If the contributor already has access to the code's task, redeeming another unused code for that task fails with reason `"already has access"`. That code stays `"unused"`, with `usedBy` and `usedAt` `undefined`, and a different contributor can still redeem it later. That redemption succeeds and sets `usedBy` to the new contributor.
- Having access to one task does not block redeeming a code for another task. After redeeming codes for `t1` and `t2`, `tasksFor("c1")` holds exactly `t1` and `t2`. The order of the array is not checked.

### Revoking a code

- `revoke(code)` on an unused code makes its state `"revoked"`. `list` then shows it as `"revoked"` with `usedBy` `undefined`.
- Revoking a used code fails: the returned promise rejects. The error type and message are not checked. The code stays `"used"` with the same `usedBy`, and the contributor keeps access.

### Access queries

- `hasAccess(contributorId, taskId)` resolves to `true` only after that contributor has successfully redeemed a code for that task. Otherwise it resolves to `false`.
- `tasksFor(contributorId)` resolves to an array of the task ids the contributor has access to, each listed once. It is `[]` for a contributor with no access.

### Listing a task's codes

- `list(taskId)` resolves to every code created for that task, whatever its state: unused, used, expired and revoked. It includes no codes from other tasks, and every entry has `taskId` equal to the requested task. The order is not checked.
- A task with no codes lists `[]`, even when other tasks have codes.
- Each entry keeps its original `createdAt` and `expiresAt`. A code created at `2026-03-10T08:00:00Z` has `expiresAt` `2026-03-24T08:00:00.000Z`.
- State is worked out from the clock at the moment of listing. An unused code is `"unused"` up to 1 ms before `expiresAt` (`2026-03-15T08:59:59.999Z`) and `"expired"` from exactly `expiresAt` (`2026-03-15T09:00:00Z`) on.
- Used entries carry `usedBy` and `usedAt`. Unused entries have both `undefined`, and revoked entries have `usedBy` `undefined`.
- A used code stays `"used"` at and after its expiry time, months later included, and still shows its `usedBy` and original `usedAt`. Example: redeemed at `2026-03-15T08:59:59.999Z` and listed at `2026-06-01T00:00:00Z`, it is still `"used"` by c1 with `usedAt` `2026-03-15T08:59:59.999Z`.

### Concurrent redemptions

- The store's `get` and `set` can each take several event-loop turns to resolve, and their calls can resolve in a different order from the one they were made in. `get` returns the value as it was when called. `set` writes its value only when it resolves.
- Under these conditions, if two different contributors redeem the same code at once (e.g. c1 and c2 via `Promise.all`), exactly one succeeds with `{ ok: true, taskId: "t1" }`. The other fails with reason `"used"`. Either one may be the winner.
- Afterwards, only the winner has access: `hasAccess(winner,"t1")` is `true`, `hasAccess(loser,"t1")` is `false`, and `tasksFor(loser)` is `[]`. `list` shows the code as `"used"` with `usedBy` equal to the winner.
