## Notes

### splitBounty

- The hidden-test amount is the bounty times the share in basis points over 10000, rounded down. The UAT amount is the rest. Example: `splitBounty(999, 7500)` gives `{ hiddenTests: 749, uat: 250 }`.
- The split must be exact for a bounty of `Number.MAX_SAFE_INTEGER` (9007199254740991), so plain floating-point multiplication is not enough:
  - at 7500 bps: `{ hiddenTests: 6755399441055743, uat: 2251799813685248 }`
  - at 3333 bps: `{ hiddenTests: 3002099511605172, uat: 6005099743135819 }`
  - at 9999 bps: `{ hiddenTests: 9006298534815516, uat: 900719925475 }`
- A share of 0 bps gives everything to UAT: `splitBounty(10000, 0)` gives `{ hiddenTests: 0, uat: 10000 }`. A share of 10000 bps gives everything to the hidden tests: `splitBounty(10000, 10000)` gives `{ hiddenTests: 10000, uat: 0 }`.
- The result object has exactly the two fields `hiddenTests` and `uat`.

### State shape

- Every state that `handle` resolves to, and every state it saves to the store, is a plain object with exactly two fields, `status` and `releases`. Nothing else goes in it, such as event ids. Each release is exactly `{ kind, amount }`.
- `handle` resolves to the same state that is now in the store.
- Releases are listed in the order they were recorded: the `"hidden-tests"` release first, then `"uat"`.

### hidden-tests-passed

- On a new task with bounty 10000 and no share given, the default share of 7500 bps applies. The result, both returned and saved, is `{ status: "partially released", releases: [{ kind: "hidden-tests", amount: 7500 }] }`.
- The configured share is used. Bounty 10000 at 1 bps releases `{ kind: "hidden-tests", amount: 1 }`, with status `"partially released"`.
- Bounty 999 at 7500 bps releases 749.

### uat-approved

- After the hidden-test release, UAT approval records a `"uat"` release for the rest of the bounty and sets the status to `"fully released"`. Bounty 10000 at the default share gives `{ status: "fully released", releases: [{ kind: "hidden-tests", amount: 7500 }, { kind: "uat", amount: 2500 }] }`, both returned and saved.
- Bounty 999 at 7500 bps gives releases of 749 and then 250.
- Progress is read from the store, not kept in the handler. With bounty 1001 at 5000 bps, one handler handles `hidden-tests-passed`. Then a brand-new handler over the same store handles `uat-approved` and resolves to `{ status: "fully released", releases: [{ kind: "hidden-tests", amount: 500 }, { kind: "uat", amount: 501 }] }`.
- If `uat-approved` arrives before the hidden-test share was released, `handle` rejects with an `Error`. Its message must match "hidden test(s) has/have not passed", case-insensitively, with a space or hyphen between "hidden" and "test". For example, "Hidden tests have not passed". Nothing is recorded. This applies:
  - on a brand-new (locked) task
  - after a `hidden-tests-failed` event

### hidden-tests-failed

- On a new task with bounty 10000, a failed run resolves to `{ status: "locked", releases: [] }`. The store either stays unwritten or holds status `"locked"` with no releases.
- After the hidden-test share was released, a failed run records nothing more. The returned `releases` and the stored `releases` both stay `[{ kind: "hidden-tests", amount: 7500 }]`. The status in this case is left open.

### Bounty of 0

- With bounty 0 (default share), `hidden-tests-passed` resolves to `{ status: "pro bono", releases: [] }`. No release is recorded. The store either stays unwritten or holds status `"pro bono"`.
- With bounty 0 and a share of 10000 bps, `hidden-tests-passed` followed by `uat-approved` never saves a state that contains any release. The second call may resolve or reject. At the end, the store holds no releases, and it is either unwritten or has status `"pro bono"`.

### Repeated events (one after another)

- Whether a repeated event resolves or rejects is left open. Only the recorded state is pinned:
  - Bounty 10000. Handling `hidden-tests-passed` with id `e1` again, or with a different id `e2`, leaves the store at `[{ hidden-tests 7500 }]` with status `"partially released"`.
  - After full release (`e1` hidden-tests-passed, `e2` uat-approved), these events change nothing: `e2` uat-approved again, `e3` uat-approved, and `e4` hidden-tests-passed. The store stays `[{ hidden-tests 7500 }, { uat 2500 }]` with status `"fully released"`.

### Concurrent events (same handler, store calls that resolve only after other pending work has run)

- Whether each concurrent call resolves or rejects is left open. What is pinned is the recorded state and the number of saves.
- Two `hidden-tests-passed` events on one handler at the same time, with the same id (`e1`, `e1`) or different ids (`e1`, `e2`), record exactly one release. Final releases are `[{ hidden-tests 7500 }]` with status `"partially released"`. Exactly one save ever contains a `"hidden-tests"` release. So the losing call must not save at all, not even an unchanged state.
- After the share was released, two `uat-approved` events at the same time, with ids `u1`/`u1` or `u1`/`u2`, give final releases of `[{ hidden-tests 7500 }, { uat 2500 }]` with status `"fully released"`. Exactly one save ever contains a `"uat"` release.

### Store failures

- If the store's `set` rejects, `handle` rejects with that same error object (identity, not a copy or wrapper). Nothing is recorded.
- After that failure, handling the same event (same id) again succeeds as if it were the first time. Bounty 10000: `hidden-tests-passed` `e1` fails on save, the store has no releases, and then a retry of `e1` resolves to `{ status: "partially released", releases: [{ hidden-tests 7500 }] }`. The store holds the same state.
- A failed save of the UAT release leaves the earlier share in place. The store stays `{ status: "partially released", releases: [{ hidden-tests 7500 }] }`. Retrying the same `uat-approved` event (`e2`) then resolves to `{ status: "fully released", releases: [{ hidden-tests 7500 }, { uat 2500 }] }`, which is also what is stored.
