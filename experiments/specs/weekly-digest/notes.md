## Notes

### Whether the digest is due

- The digest is due from Monday 00:00:00 local time in the organization's time zone. In Asia/Singapore (UTC+8), `2026-03-01T16:00:00Z` (Monday 00:00:00) and `2026-03-01T16:30:00Z` (Monday 00:30) are due. `2026-03-01T15:59:59Z` (Sunday 23:59:59) is not.
- Local Monday is worked out with the time zone's daylight-saving offset in effect at that moment. America/New_York moved its clocks forward on Sunday 2026-03-08, so the following Monday starts at `2026-03-09T04:00:00Z` (UTC-4). `2026-03-09T04:00:00Z` and `2026-03-09T04:30:00Z` are due. `2026-03-09T03:59:59Z` (Sunday 23:59:59 local) is not.
- An unknown time zone throws an `Error` whose message contains the zone name. For example, `"Mars/Olympus"` must throw an error whose message includes `Mars/Olympus`.

### Which tasks are listed

- Only open tasks are listed, and merged tasks are left out. Given an open task `open-1` and a merged task `merged-1`, the list holds only `open-1`.
- With exactly one open task, the list has exactly one entry.
- Each entry carries the task's `id` and its `title` unchanged. For example, title `"Task t1"` stays `"Task t1"`.
- If no task is open, the result is `null`. This applies both when every task is merged and when the task list is empty.
- An unknown time zone throws an `Error` whose message contains the zone name, even when there are open tasks. For example, `"Mars/Olympus"` with one open task throws an error whose message includes `Mars/Olympus`.

### Entry fields

- `ageDays` is the number of whole 24-hour periods between posting and now, rounded down. Posted exactly 10 days before now gives 10. Posted 9 days 23 hours before gives 9. Posted 10 days minus 1 millisecond before gives 9.
- `submissions` is the number of submissions: 2 for a task with two submissions, 0 for a task with none.
- `furthestGate` is the highest gate across all submissions, not the gate of the latest one. Gate 1 then gate 2 gives 2. Gate 3 six days ago followed by gate 1 two days ago gives 3.
- `furthestGate` is 0 when the task has no submissions.

### Stalled

- A task with no submissions is stalled when it was posted 14 days or more before now. Posted exactly 14 days before is stalled. Posted 13 days 23 hours before is not.
- A task with submissions is stalled when its latest submission is 14 days or more before now. Earlier submissions do not matter. Submissions 18 and 14 days before now: stalled. One submission 13 days 23 hours before now: not stalled.
- A recent submission keeps an old task from being stalled. Posted 30 days ago with a submission 2 days ago is not stalled. Posted 10 days ago with its latest submission 3 days ago is not stalled.

### Order of the list

- Stalled tasks come first, then the rest. A stalled task posted 15 days ago comes before a task posted 60 days ago that had a submission 1 day ago.
- Within each group, tasks are ordered by posting age, oldest first, not by recent activity. Take these tasks (time posted, latest submission):
  - `fresh-young`: posted 2 days ago, no submissions
  - `stalled-young`: posted 20 days ago, no submissions
  - `fresh-old`: posted 12 days ago, submission 1 day ago
  - `stalled-old`: posted 40 days ago, submission 25 days ago

  They are ordered `stalled-old`, `stalled-young`, `fresh-old`, `fresh-young`.
- Within a group, tasks posted at the same moment are ordered by id ascending. Tasks `c`, `a`, `b` (posted 5 days ago) and `y`, `x` (posted 20 days ago, stalled) are ordered `x`, `y`, `a`, `b`, `c`.

### Subject

- The subject is `Weekly digest: N open tasks, M stalled`. N counts open tasks and M counts the stalled ones among them. Five open tasks with none submitted, posted 1, 20, 3, 30 and 5 days ago, give `"Weekly digest: 5 open tasks, 2 stalled"`.
- For one open task, the word is singular: `"Weekly digest: 1 open task, 0 stalled"`. "stalled" stays the same whatever the count, including 0.
- Merged tasks are not counted, even if they would otherwise be stalled. Two open tasks, posted 20 and 2 days ago, plus one merged task posted 30 days ago give `"Weekly digest: 2 open tasks, 1 stalled"`.
