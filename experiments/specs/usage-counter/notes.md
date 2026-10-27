## Notes

### Totals (`taskTotals`, `contributorTotals`)

- Totals come back as an object whose `inputTokens`, `outputTokens` and `costMicroDollars` are `bigint` values (e.g. `0n`, `1000n`), not numbers. Only those three fields are compared, so extra fields don't matter.
- One report adds to its task's total and to its contributor's total on that task. After `t1`/`c1` reports 1000 input, 200 output and 3400 cost, both `taskTotals("t1")` and `contributorTotals("t1", "c1")` are `{1000n, 200n, 3400n}`.
- A report whose counts are all 0 is accepted (it resolves), and the totals read `{0n, 0n, 0n}`.
- Reports add up. `t1`/`c1` (1000, 200, 3400) followed by `t1`/`c1` (1, 2, 3) gives `{1001n, 202n, 3403n}` for both the task and the contributor.
- A task total sums every contributor on that task. A contributor total only covers that contributor on that one task. Given `t1`/`c1` (10,1,100), `t1`/`c2` (20,2,200), `t2`/`c1` (40,4,400) and `t1`/`c1` (80,8,800): task `t1` = `{110n, 11n, 1100n}`, task `t2` = `{40n, 4n, 400n}`, `t1`/`c1` = `{90n, 9n, 900n}`, `t1`/`c2` = `{20n, 2n, 200n}`, `t2`/`c1` = `{40n, 4n, 400n}`, `t2`/`c2` = `{0n, 0n, 0n}`.
- Ids that would look the same once joined with a separator still keep separate totals. Each of these pairs counts on its own: (`"a:b"`, `"c"`), (`"a"`, `"b:c"`), (`"a/b"`, `"c"`), (`"a"`, `"b/c"`), (`"a|b"`, `"c"`), (`"a"`, `"b|c"`), (`"t1"`, `"c1"`), (`"t1:c1"`, `"x"`), (`"t1/c1"`, `"x"`). With the values 1, 2, 4, 8, 16, 32, 64, 128 and 256 used for all three counts of each pair in turn, every contributor total equals only its own value. Task `"a"` is 42 (2+8+32), `"a:b"` is 1, `"a/b"` is 4, `"a|b"` is 16, `"t1"` is 64, `"t1:c1"` is 128 and `"t1/c1"` is 256.
- A task or contributor with no reports reads `{0n, 0n, 0n}`. This holds on a brand-new empty store. It also holds next to totals that do have reports: after only `t1`/`c1` (10,20,30), the reads `contributorTotals("t1","c2")`, `contributorTotals("t2","c1")` and `taskTotals("t2")` are all zero. They are zero both on the same counter and on a new counter over the same store.
- Totals stay exact past 2^53. `Number.MAX_SAFE_INTEGER` (2^53 − 1) is a valid count. Three reports of MAX for every count give 27021597764222973 (3 × MAX) for each field. MAX, MAX, MAX followed by 2, 1, 3 gives `{2^53 + 1, 2^53, 2^53 + 2}` exactly.

### Validation (`report`)

- An invalid report makes `report` return a rejected promise (it does not throw synchronously). The rejection reason is an `Error` instance; its message is not checked.
- Each of these is refused: an empty task id (`""`), an empty contributor id (`""`), a negative count (output `-1`), a fractional count (cost `0.5`), a `NaN` count (input `NaN`), and a count that is a string (input `"5"`).
- A refused report changes no total at all, including its valid counts. Take a store already holding `t1`/`c1` = `{1000n, 200n, 3400n}`. A refused report on `t1`/`c1` such as (500, 50, −0.5) leaves both the task and contributor totals at `{1000n, 200n, 3400n}`, read through the same counter or through a new counter over the same store.
- A refused report doesn't block later ones. After (−5, 1, 1) is refused, a report of (7, 8, 9) leaves the totals at exactly `{7n, 8n, 9n}`.

### Store failures

- If the store's `set` rejects, `report` rejects with that same error object (the identical instance, not a wrapper or copy).
- A report whose save fails counts for nothing, in either the task or the contributor total. That is true through the same counter and through a new counter over the same store. Example: after (100, 10, 1000) counts, a failed (7, 7, 7) leaves the totals at `{100n, 10n, 1000n}`. A later (1, 2, 3) then counts normally, giving `{101n, 12n, 1003n}` both ways.
- If the very first report's save fails, every total stays at `{0n, 0n, 0n}`. A later (11, 12, 13) then gives exactly `{11n, 12n, 13n}`.
- The store failure in these cases affects only one `set` call, the next one made after the failure is armed. A failing `set` saves nothing.
- One failed save among overlapping reports: 10 reports go to `t1`/`c1` at once over a slow store, report *i* being (i+1, 1, 2^i). The next `set` fails. At least one report rejects, every rejection is the store's error, and the totals (same counter and a new counter) equal exactly the sum of the reports that resolved. A later report (1000, 1000, 2^20) then adds on top of that.

### Persistence / restart

- A new counter over the same store sees every total already counted and adds to it. After `t1`/`c1` (10,1,100), `t1`/`c2` (20,2,200) and `t2`/`c1` (40,4,400) on the first counter, a second counter reads task `t1` `{30n,3n,300n}`, task `t2` `{40n,4n,400n}`, `t1`/`c1` `{10n,1n,100n}`, `t1`/`c2` `{20n,2n,200n}` and `t2`/`c1` `{40n,4n,400n}`. After the second counter reports `t1`/`c1` (5,5,5): task `t1` is `{35n,8n,305n}`, `t1`/`c1` is `{15n,6n,105n}` and `t1`/`c2` stays `{20n,2n,200n}`.
- Values past 2^53 survive a restart exactly. MAX + 2 on one counter reads 2^53 + 1 for every field on a second counter. Adding 1 there reads 2^53 + 2 on a third counter.
- The original counter keeps working correctly after a new counter has been opened over the same store and read from it. The two counters agree on all totals.
- The store saves a copy of the value passed to `set`, taken at the moment of the call, and `get` returns a fresh copy (a structured clone). Saved values must survive structured cloning, and changing a value after saving it does not change what is stored.
- The store contents alone are enough to rebuild the totals. A new counter over a new store holding only a copy of the saved data reads the same totals.

### Overlapping reports

- No reports are lost when many overlap. 50 reports run at once on `t1` over a store whose calls each take a varying 1–11 microtask turns. Report *i* has contributor `c(i % 5)` and counts (i+1, 2(i+1), 1000+i). The task total equals the sum of all 50, each contributor total equals the sum of its own reports, and a new counter over the store reads the same task total.
- Each report resolves only after totals that include it have been saved. 50 reports run at once on `t1` (contributor `c(i % 2)`, counts (1, 1, 2^i)). At the moment report *i* resolves, the store already holds a task total and that contributor's total whose cost includes bit 2^i.
- No reports are lost even when the store completes waiting calls in batches, newest first (pending `get` and `set` calls run in reverse order of when they were made). With 50 overlapping reports on `t1`/`c1`, counts (3i+1, i, 2^i), all 50 settle and the task and contributor totals both equal the sum of all 50.
- Reports on different tasks don't wait for each other. While a report on `t1` is stuck on a store call that hasn't resolved, a report on `t2` still goes through and resolves. The `t1` report has not resolved at that point. This holds when the two reports have different contributors (`c1` on `t1`, `c2` on `t2`) and also when they have the same one (`c1` on both). Once the stuck call is released, the `t1` report resolves. The totals are then `t1` = (10, 20, 30) and `t2` = (1, 2, 3) for both the task and the contributor.
- A report touches the store before it resolves. The stuck `t1` report above is waiting on at least one store call.
