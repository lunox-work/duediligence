# Night shifts should count toward every day and week they work into
## Context
Planners on night rosters report that a 22:00–06:00 shift counts only toward the day it starts: six nights in a row work on seven calendar days yet pass the days-in-a-row check, and a Sunday night into Monday puts all its hours in the old week.
## Change
A shift that runs past midnight should count toward every calendar day it works on for days in a row, and its hours should be split at Monday midnight between the two weeks for the weekly limit.
## Acceptance criteria
- Six 22:00–06:00 nights starting Monday to Saturday are a run of 7 days.
- A shift from Sunday 20:00 to Monday 04:00 puts half its hours in each week.
## Scope
Which day and week hours belong to, nothing else: shift length, breaks, rest and overlaps are checked as today, with no new policy settings and no change to the result.
