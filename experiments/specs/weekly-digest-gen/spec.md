# Weekly digest of open bounties and their gate status

Engineering leads lose track of posted tasks that have stalled. Every Monday
they get an email listing each open task with its age, how many submissions it
has, and the furthest gate any submission reached. Tasks with no activity for
14 days are flagged as stalled. This spec covers only building the digest in
`src/index.ts`: `isDigestDue(timeZone, now)` says whether it is Monday in the
organization's time zone, and `buildDigest(input)` builds the `Digest` (or
returns `null` when nothing is open). Sending the email is a separate task.

Both functions are pure and synchronous: their results depend only on their
arguments (never on the system clock or the host's time zone), they keep no
state between calls, and they never modify their arguments. All instants in
this spec are written in ISO 8601 UTC; "day" in durations means exactly
86 400 000 ms.

```gherkin
Feature: Weekly digest of open bounties and their gate status

  Rule: A time zone is accepted when it is an IANA name the runtime's Intl API knows; otherwise both functions throw a RangeError naming it
    # Accepted: whatever `new Intl.DateTimeFormat("en-US", { timeZone })` accepts,
    # including "UTC", "GMT", "Etc/GMT-8" and legacy links like "US/Eastern",
    # matched case-insensitively exactly as Intl does, with no trimming.
    # Rejected even if the runtime accepts it: a UTC offset string, i.e. any
    # value starting with "+" or "-" (such as "+08:00").
    # The error is a RangeError whose message is exactly:
    #   Unknown time zone: "<timeZone as given>"
    # The time zone is checked before anything else, so buildDigest throws
    # even when it would otherwise return null.

    @happy
    Scenario Outline: Accepted time zones do not throw
      When isDigestDue is called with timeZone "<timeZone>" and now "2026-10-26T02:00:00.000Z"
      Then it returns <due> without throwing

      Examples:
        | timeZone         | due   |
        | Asia/Singapore   | true  |
        | America/New_York | false |
        | UTC              | true  |
        | utc              | true  |
        | asia/singapore   | true  |
        | Etc/GMT-8        | true  |
        | US/Eastern       | false |

    @unhappy
    Scenario Outline: Unknown time zones are rejected by isDigestDue
      When isDigestDue is called with timeZone <timeZone> and now "2026-10-26T02:00:00.000Z"
      Then it throws a RangeError with message <message>

      Examples:
        | timeZone       | message                              |
        | "Mars/Olympus" | 'Unknown time zone: "Mars/Olympus"'  |
        | ""             | 'Unknown time zone: ""'              |
        | " UTC"         | 'Unknown time zone: " UTC"'          |
        | "+08:00"       | 'Unknown time zone: "+08:00"'        |
        | "-05:00"       | 'Unknown time zone: "-05:00"'        |

    @unhappy
    Scenario: buildDigest rejects an unknown time zone even when no task is open
      When buildDigest is called with:
        | timeZone     | tasks | now                      |
        | Mars/Olympus | []    | 2026-10-26T09:00:00.000Z |
      Then it throws a RangeError with message 'Unknown time zone: "Mars/Olympus"'

    @unhappy
    Scenario: buildDigest rejects an unknown time zone when tasks are open
      Given an open task "T1" posted at "2026-10-19T09:00:00.000Z" with no submissions
      When buildDigest is called with timeZone "Not/AZone", that task and now "2026-10-26T09:00:00.000Z"
      Then it throws a RangeError with message 'Unknown time zone: "Not/AZone"'

  Rule: Invalid Date values are rejected with a RangeError; validation order is time zone, then now, then tasks in array order
    # `now` that is an Invalid Date (getTime() is NaN) throws a RangeError with
    # message exactly: Invalid date: now
    # A task (open or merged) whose postedAt or any submission's `at` is an
    # Invalid Date throws a RangeError with message exactly:
    #   Invalid date in task "<id>"
    # Tasks are checked in array order and the first failure is thrown.
    # Inputs that violate the TypeScript types in other ways (a status other
    # than "open"/"merged", a gate other than 1/2/3, non-Date values) are
    # outside the contract and must not be tested.

    @unhappy
    Scenario: isDigestDue rejects an invalid now
      When isDigestDue is called with timeZone "UTC" and now new Date("garbage")
      Then it throws a RangeError with message "Invalid date: now"

    @unhappy
    Scenario: buildDigest rejects an invalid now
      When buildDigest is called with timeZone "UTC", tasks [] and now new Date("garbage")
      Then it throws a RangeError with message "Invalid date: now"

    @unhappy
    Scenario: The time zone is checked before now
      When isDigestDue is called with timeZone "Mars/Olympus" and now new Date("garbage")
      Then it throws a RangeError with message 'Unknown time zone: "Mars/Olympus"'

    @unhappy
    Scenario Outline: Invalid dates inside tasks are rejected, naming the first offending task
      Given these tasks in this order:
        | id | status   | postedAt                 | submissions                              |
        | A  | open     | 2026-10-19T09:00:00.000Z | []                                       |
        | B  | <statusB> | <postedAtB>             | <submissionsB>                           |
        | C  | open     | invalid                  | []                                       |
      When buildDigest is called with timeZone "UTC", these tasks and now "2026-10-26T09:00:00.000Z"
      Then it throws a RangeError with message '<message>'

      Examples:
        | statusB | postedAtB                | submissionsB                               | message                    |
        | open    | invalid                  | []                                         | Invalid date in task "B"   |
        | merged  | invalid                  | []                                         | Invalid date in task "B"   |
        | open    | 2026-10-19T09:00:00.000Z | [{at: invalid, gate: 1}]                   | Invalid date in task "B"   |
        | open    | 2026-10-19T09:00:00.000Z | [{at: 2026-10-20T09:00:00.000Z, gate: 1}]  | Invalid date in task "C"   |

  Rule: isDigestDue is true for every instant of Monday in the organization's time zone, and false otherwise
    # Monday runs from 00:00:00.000 local time inclusive to 00:00:00.000 local
    # Tuesday exclusive, using the zone's offset in effect at `now` (so DST is
    # honoured). It is true for the whole day, not just at midnight; sending
    # once per Monday is the caller's job. The host's own time zone is ignored.

    @boundary
    Scenario Outline: Monday boundaries in Asia/Singapore (UTC+8)
      When isDigestDue is called with timeZone "Asia/Singapore" and now "<now>"
      Then it returns <due>

      Examples:
        | now                      | local time                  | due   |
        | 2026-10-25T15:59:59.999Z | Sun 2026-10-25 23:59:59.999 | false |
        | 2026-10-25T16:00:00.000Z | Mon 2026-10-26 00:00:00.000 | true  |
        | 2026-10-26T04:00:00.000Z | Mon 2026-10-26 12:00:00.000 | true  |
        | 2026-10-26T15:59:59.999Z | Mon 2026-10-26 23:59:59.999 | true  |
        | 2026-10-26T16:00:00.000Z | Tue 2026-10-27 00:00:00.000 | false |

    @happy
    Scenario Outline: The same instant is Monday in one zone and Sunday in another
      When isDigestDue is called with timeZone "<timeZone>" and now "2026-10-26T02:00:00.000Z"
      Then it returns <due>

      Examples:
        | timeZone         | local time       | due   |
        | Asia/Singapore   | Mon 10:00        | true  |
        | UTC              | Mon 02:00        | true  |
        | America/New_York | Sun 22:00 (EDT)  | false |

    @boundary
    Scenario Outline: Daylight saving changes move the start of Monday in America/New_York
      When isDigestDue is called with timeZone "America/New_York" and now "<now>"
      Then it returns <due>

      Examples:
        | now                      | local time                       | due   |
        | 2026-10-26T03:59:59.999Z | Sun 2026-10-25 23:59:59.999 EDT  | false |
        | 2026-10-26T04:00:00.000Z | Mon 2026-10-26 00:00:00.000 EDT  | true  |
        | 2026-11-02T04:59:59.999Z | Sun 2026-11-01 23:59:59.999 EST  | false |
        | 2026-11-02T05:00:00.000Z | Mon 2026-11-02 00:00:00.000 EST  | true  |

    @happy
    Scenario Outline: Other weekdays are not due
      When isDigestDue is called with timeZone "UTC" and now "<now>"
      Then it returns false

      Examples:
        | now                      |
        | 2026-10-24T12:00:00.000Z |
        | 2026-10-27T12:00:00.000Z |
        | 2026-10-30T12:00:00.000Z |

  Rule: buildDigest lists open tasks only and returns null when none is open
    # Tasks with status "merged" are never listed and are not counted in the
    # subject. When no task has status "open" (including an empty tasks
    # array) the result is null, not a Digest with an empty list.
    # buildDigest does not check the weekday: it builds the digest whenever
    # it is called. The time zone is validated but does not affect the result.

    Background:
      Given timeZone "Asia/Singapore"
      And now "2026-10-26T09:00:00.000Z"

    @happy
    Scenario: A full digest
      Given these tasks:
        | id | title       | status | postedAt                 | submissions                                                                   |
        | T1 | Fix login   | open   | 2026-10-01T09:00:00.000Z | [{at: 2026-10-05T09:00:00.000Z, gate: 1}, {at: 2026-10-08T09:00:00.000Z, gate: 3}] |
        | T2 | Add export  | open   | 2026-10-19T09:00:00.000Z | []                                                                            |
        | T3 | Docs        | merged | 2026-09-01T09:00:00.000Z | []                                                                            |
        | T4 | Speed up CI | open   | 2026-09-20T09:00:00.000Z | [{at: 2026-10-20T09:00:00.000Z, gate: 2}]                                     |
        | T5 | Dark mode   | open   | 2026-10-05T12:00:00.000Z | []                                                                            |
      When buildDigest is called
      Then the subject is "Weekly digest: 4 open tasks, 2 stalled"
      And the tasks are, in this order:
        | id | title       | ageDays | submissions | furthestGate | stalled |
        | T1 | Fix login   | 25      | 2           | 3            | true    |
        | T5 | Dark mode   | 20      | 0           | 0            | true    |
        | T4 | Speed up CI | 36      | 1           | 2            | false   |
        | T2 | Add export  | 7       | 0           | 0            | false   |

    @boundary
    Scenario: No tasks at all gives null
      When buildDigest is called with tasks []
      Then it returns null

    @boundary
    Scenario: Only merged tasks gives null
      Given these tasks:
        | id | title | status | postedAt                 | submissions                               |
        | M1 | Old   | merged | 2026-09-01T09:00:00.000Z | [{at: 2026-09-02T09:00:00.000Z, gate: 3}] |
        | M2 | Older | merged | 2026-08-01T09:00:00.000Z | []                                        |
      When buildDigest is called
      Then it returns null

    @happy
    Scenario: buildDigest does not depend on the weekday
      Given an open task "T2" titled "Add export" posted at "2026-10-19T09:00:00.000Z" with no submissions
      When buildDigest is called with now "2026-10-28T09:00:00.000Z" (a Wednesday)
      Then the subject is "Weekly digest: 1 open task, 0 stalled"
      And the only entry is T2 with ageDays 9, submissions 0, furthestGate 0, stalled false

  Rule: Each entry has exactly the fields id, title, ageDays, submissions, furthestGate and stalled
    # id and title are copied verbatim (no trimming; empty strings allowed).
    # submissions is the length of the task's submissions array.
    # furthestGate is the maximum gate across all submissions regardless of
    # their order, or 0 when there are none.
    # Entries are new plain objects with no other properties; the Digest has
    # exactly the properties subject and tasks.

    Background:
      Given timeZone "UTC"
      And now "2026-10-26T09:00:00.000Z"

    @happy
    Scenario Outline: furthestGate is the highest gate reached by any submission
      Given an open task "T1" posted at "2026-10-20T09:00:00.000Z" with submissions <submissions>
      When buildDigest is called
      Then the entry for "T1" has submissions <count> and furthestGate <furthestGate>

      Examples:
        | submissions                                                                                                    | count | furthestGate |
        | []                                                                                                             | 0     | 0            |
        | [{at: 2026-10-21T09:00:00.000Z, gate: 1}]                                                                      | 1     | 1            |
        | [{at: 2026-10-21T09:00:00.000Z, gate: 3}, {at: 2026-10-22T09:00:00.000Z, gate: 1}]                             | 2     | 3            |
        | [{at: 2026-10-21T09:00:00.000Z, gate: 2}, {at: 2026-10-22T09:00:00.000Z, gate: 2}, {at: 2026-10-23T09:00:00.000Z, gate: 1}] | 3     | 2            |

    @boundary
    Scenario: Titles and ids are copied verbatim
      Given an open task with id " x " and title "" posted at "2026-10-20T09:00:00.000Z" with no submissions
      When buildDigest is called
      Then the entry deep-equals {id: " x ", title: "", ageDays: 6, submissions: 0, furthestGate: 0, stalled: false}

  Rule: ageDays is the number of whole 24-hour periods from postedAt to now, rounded down, and never negative
    # ageDays = floor((now - postedAt) / 86 400 000 ms), in absolute time, so
    # time zones and DST do not affect it. A postedAt later than now (clock
    # skew) gives ageDays 0.

    Background:
      Given timeZone "UTC"
      And now "2026-10-26T09:00:00.000Z"

    @boundary
    Scenario Outline: Age is rounded down to whole days
      Given an open task "T1" posted at "<postedAt>" with no submissions
      When buildDigest is called
      Then the entry for "T1" has ageDays <ageDays>

      Examples:
        | postedAt                 | ageDays |
        | 2026-10-26T09:00:00.000Z | 0       |
        | 2026-10-25T09:00:00.001Z | 0       |
        | 2026-10-25T09:00:00.000Z | 1       |
        | 2026-10-12T09:00:00.001Z | 13      |
        | 2026-10-12T09:00:00.000Z | 14      |
        | 2026-10-26T09:00:00.001Z | 0       |
        | 2026-11-30T09:00:00.000Z | 0       |

    @boundary
    Scenario: Age ignores a DST change in the organization's time zone
      Given timeZone "America/New_York"
      And now "2026-11-02T12:00:00.000Z"
      And an open task "T1" posted at "2026-10-31T12:00:00.000Z" with no submissions
      When buildDigest is called
      Then the entry for "T1" has ageDays 2

  Rule: A task is stalled when its latest activity is 14 days or more before now
    # Latest activity is the latest `at` among its submissions (by time, not
    # array position), or postedAt when it has no submissions.
    # stalled = (now - latest activity) >= 14 * 86 400 000 ms. Exactly 14 days
    # is stalled. Activity later than now is not stalled.

    Background:
      Given timeZone "UTC"
      And now "2026-10-26T09:00:00.000Z"

    @boundary
    Scenario Outline: The 14-day threshold
      Given an open task "T1" posted at "<postedAt>" with submissions <submissions>
      When buildDigest is called
      Then the entry for "T1" has stalled <stalled>

      Examples:
        | postedAt                 | submissions                                  | stalled |
        | 2026-10-12T09:00:00.000Z | []                                           | true    |
        | 2026-10-12T09:00:00.001Z | []                                           | false   |
        | 2026-09-01T09:00:00.000Z | [{at: 2026-10-12T09:00:00.000Z, gate: 1}]    | true    |
        | 2026-09-01T09:00:00.000Z | [{at: 2026-10-12T09:00:00.001Z, gate: 1}]    | false   |
        | 2026-09-01T09:00:00.000Z | [{at: 2026-10-27T09:00:00.000Z, gate: 1}]    | false   |
        | 2026-10-30T09:00:00.000Z | []                                           | false   |

    @happy
    Scenario: The latest submission counts, wherever it is in the array
      Given an open task "T1" posted at "2026-09-01T09:00:00.000Z" with submissions:
        | at                       | gate |
        | 2026-10-20T09:00:00.000Z | 1    |
        | 2026-10-02T09:00:00.000Z | 2    |
      When buildDigest is called
      Then the entry for "T1" has stalled false and furthestGate 2

    @happy
    Scenario: An old task with a recent submission is not stalled, a new task never submitted to can be
      Given these tasks:
        | id  | status | postedAt                 | submissions                               |
        | OLD | open   | 2026-06-01T09:00:00.000Z | [{at: 2026-10-25T09:00:00.000Z, gate: 1}] |
        | NEW | open   | 2026-10-10T09:00:00.000Z | []                                        |
      When buildDigest is called
      Then the entry for "OLD" has stalled false
      And the entry for "NEW" has stalled true

  Rule: The subject reads "Weekly digest: <n> open task(s), <s> stalled"
    # <n> is the number of listed (open) tasks and <s> the number of them
    # that are stalled, as plain decimal integers. "task" is singular when
    # n is 1, otherwise "tasks". "stalled" never changes, and the stalled
    # part is always present, even when s is 0.

    @boundary
    Scenario Outline: Subject wording
      Given <n> open tasks of which <s> are stalled
      When buildDigest is called
      Then the subject is "<subject>"

      Examples:
        | n  | s  | subject                                  |
        | 1  | 0  | Weekly digest: 1 open task, 0 stalled    |
        | 1  | 1  | Weekly digest: 1 open task, 1 stalled    |
        | 2  | 0  | Weekly digest: 2 open tasks, 0 stalled   |
        | 5  | 2  | Weekly digest: 5 open tasks, 2 stalled   |
        | 12 | 12 | Weekly digest: 12 open tasks, 12 stalled |

  Rule: Entries are ordered stalled first, then by postedAt ascending, then by id, then by input position
    # Within the stalled group and within the other group, the task with the
    # earlier postedAt instant comes first (compared to the millisecond, not by
    # ageDays). Equal postedAt is ordered by id using plain string comparison
    # of UTF-16 code units (so "B" < "a" < "b"; not locale-aware). Tasks with
    # the same id and postedAt (duplicate ids are allowed and listed
    # separately) keep their relative input order.

    Background:
      Given timeZone "UTC"
      And now "2026-10-26T09:00:00.000Z"

    @happy
    Scenario: Older first uses the exact posting instant, not ageDays
      Given these open tasks with no submissions:
        | id | postedAt                 |
        | a  | 2026-10-19T10:00:00.000Z |
        | z  | 2026-10-19T09:00:00.000Z |
      When buildDigest is called
      Then both entries have ageDays 6
      And the entry ids are, in order: z, a

    @boundary
    Scenario: Equal posting times are ordered by id code units
      Given these open tasks with no submissions, all posted at "2026-10-19T09:00:00.000Z":
        | id  |
        | b   |
        | a   |
        | B   |
        | a10 |
        | a2  |
      When buildDigest is called
      Then the entry ids are, in order: B, a, a10, a2, b

    @boundary
    Scenario: Duplicate ids are both listed in input order
      Given these open tasks with no submissions, all posted at "2026-10-19T09:00:00.000Z":
        | id | title  |
        | X  | first  |
        | X  | second |
      When buildDigest is called
      Then the subject is "Weekly digest: 2 open tasks, 0 stalled"
      And the entry titles are, in order: first, second

    @happy
    Scenario: A stalled task comes before an older task that is not stalled
      Given these tasks:
        | id | status | postedAt                 | submissions                               |
        | P  | open   | 2026-01-01T09:00:00.000Z | [{at: 2026-10-25T09:00:00.000Z, gate: 2}] |
        | Q  | open   | 2026-10-01T09:00:00.000Z | []                                        |
      When buildDigest is called
      Then the entry ids are, in order: Q, P

  Rule: Calls are independent and never modify their input
    # Neither function keeps state between calls or reads the system clock.
    # buildDigest does not reorder, add to or alter input.tasks, any task, or
    # any submissions array, and returns fresh objects on every call.

    @concurrency
    Scenario: Interleaved calls on shared input give identical, independent results
      Given one DigestInput with timeZone "Asia/Singapore", now "2026-10-26T09:00:00.000Z" and the tasks of "A full digest"
      And a second DigestInput with timeZone "UTC", now "2026-10-26T09:00:00.000Z" and only task T2 from "A full digest"
      When buildDigest is called on the first input, then on the second, then on the first again, with isDigestDue("America/New_York", "2026-10-26T02:00:00.000Z") called between each
      Then both results for the first input deep-equal the expected digest of "A full digest" and are not the same object
      And the result for the second input has subject "Weekly digest: 1 open task, 0 stalled"
      And every isDigestDue call returns false
      And the first input's tasks array, task objects and submissions arrays are unchanged in order and content

    @concurrency
    Scenario: Mutating a returned digest does not affect later calls
      Given the DigestInput of "A full digest"
      When buildDigest is called and the caller pushes an extra entry onto the returned tasks array and sets its first entry's stalled to false
      And buildDigest is called again with the same input
      Then the second result deep-equals the expected digest of "A full digest"
```

Decided:
- Time zone validity: whatever `Intl.DateTimeFormat` accepts (case-insensitive, links like "US/Eastern", no trimming), except UTC-offset strings starting with "+" or "-", which are rejected.
- Error type and message for an unknown time zone: `RangeError`, `Unknown time zone: "<tz>"`, checked before anything else, so `buildDigest` throws even when it would return null.
- Invalid Date handling: `RangeError` `Invalid date: now`, or `Invalid date in task "<id>"` for postedAt or a submission time (merged tasks included). Checks run in order: time zone, then now, then tasks in array order.
- Inputs that break the TypeScript types in other ways are outside the contract.
- When Monday is: local 00:00:00.000 inclusive to Tuesday 00:00 exclusive, using the zone's offset at `now` (DST honoured). True for the whole day; sending once is the caller's job.
- `buildDigest` doesn't check the weekday, and the time zone has no effect on its output.
- `ageDays`: floor of elapsed ms / 86 400 000 in absolute time, clamped to 0 when postedAt is after now.
- Stalled threshold: exactly 14 × 24 h counts as stalled. Latest activity is the latest submission by time (not array position), or postedAt when there are none. Activity after now is not stalled.
- `furthestGate` is the highest gate across all submissions, whatever their order; 0 when there are none.
- Subject wording: "1 open task" singular, otherwise "tasks". The stalled count is always shown, including "0 stalled".
- Ordering: stalled first, then earliest postedAt to the millisecond, then id by UTF-16 code-unit comparison, then input order.
- Duplicate ids are allowed and listed separately.
- Output shape: entries and digest have exactly the interface fields; id and title are copied verbatim.
- Overlapping or repeated calls: no shared state, input never mutated, fresh result objects each call.
