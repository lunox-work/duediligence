# Per-task token usage counter

Token spend has to be metered per task for both payment modes, and nothing
counts it yet. `UsageCounter` (in `src/index.ts`) sums the input tokens,
output tokens and cost in micro-dollars that each model call reports, both
per task and per contributor on that task. It keeps its totals in a
`UsageStore` the caller supplies, so a new `UsageCounter` over the same store
(for example after a restart) sees the totals already counted. The store's
calls may take any time to resolve and `set` may reject; the counter must
never lose or double-count a report because of that, and reports on different
tasks must not wait for each other.

The store is the only state that outlives a counter, so its layout is part of
this spec: one key per task, holding that task's totals and the totals of
every contributor on it, written with a single `set` per report. Because one
`set` covers both the task total and the contributor total, a report is either
counted in both or in neither.

```gherkin
Feature: Per-task token usage counter

  Background:
    Given a store "S" that keeps values in memory by key, returning from get(key) the last value given to set(key, value), or undefined if there is none
    And a UsageCounter "counter" created with new UsageCounter(S)

  Rule: A report adds its counts to its task's totals and to its contributor's totals on that task

    @happy
    Scenario: A single report is counted for its task and its contributor
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 100, outputTokens: 20, costMicroDollars: 350 }) resolves
      Then counter.taskTotals("t1") resolves to { inputTokens: 100n, outputTokens: 20n, costMicroDollars: 350n }
      And counter.contributorTotals("t1", "alice") resolves to { inputTokens: 100n, outputTokens: 20n, costMicroDollars: 350n }

    @happy
    Scenario: Task totals sum every contributor, contributor totals only their own reports
      When these reports are made one after another, each awaited:
        | taskId | contributorId | inputTokens | outputTokens | costMicroDollars |
        | t1     | alice         | 100         | 20           | 350              |
        | t1     | bob           | 40          | 5            | 90               |
        | t1     | alice         | 1           | 2            | 3                |
        | t2     | alice         | 7           | 0            | 11               |
      Then the totals are:
        | query                                   | inputTokens | outputTokens | costMicroDollars |
        | counter.taskTotals("t1")                | 141n        | 27n          | 443n             |
        | counter.contributorTotals("t1", "alice")| 101n        | 22n          | 353n             |
        | counter.contributorTotals("t1", "bob")  | 40n         | 5n           | 90n              |
        | counter.taskTotals("t2")                | 7n          | 0n           | 11n              |
        | counter.contributorTotals("t2", "alice")| 7n          | 0n           | 11n              |
        | counter.contributorTotals("t2", "bob")  | 0n          | 0n           | 0n               |

    @happy
    Scenario: The same report made twice is counted twice
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 5, outputTokens: 1, costMicroDollars: 2 }) resolves
      And counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 5, outputTokens: 1, costMicroDollars: 2 }) resolves
      Then counter.taskTotals("t1") resolves to { inputTokens: 10n, outputTokens: 2n, costMicroDollars: 4n }

    @boundary
    Scenario: A report of all zeros is accepted and saved
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 0, outputTokens: 0, costMicroDollars: 0 }) resolves
      Then S.set has been called exactly once
      And counter.contributorTotals("t1", "alice") resolves to { inputTokens: 0n, outputTokens: 0n, costMicroDollars: 0n }

    @boundary
    Scenario: Ids are matched exactly, case- and whitespace-sensitively
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }) resolves
      Then the totals are:
        | query                                    | inputTokens | outputTokens | costMicroDollars |
        | counter.taskTotals("t1")                 | 1n          | 1n           | 1n               |
        | counter.taskTotals("T1")                 | 0n          | 0n           | 0n               |
        | counter.taskTotals(" t1")                | 0n          | 0n           | 0n               |
        | counter.contributorTotals("t1", "Alice") | 0n          | 0n           | 0n               |
        | counter.contributorTotals("t1", "alice ")| 0n          | 0n           | 0n               |

    @boundary
    Scenario: Ids containing separators and unusual characters stay distinct
      When these reports are made one after another, each awaited:
        | taskId    | contributorId | inputTokens | outputTokens | costMicroDollars |
        | a:b       | c             | 1           | 0            | 0                |
        | a         | b:c           | 2           | 0            | 0                |
        | __proto__ | constructor   | 3           | 0            | 0                |
        | " "       | " "           | 4           | 0            | 0                |
      Then the totals are:
        | query                                              | inputTokens |
        | counter.taskTotals("a:b")                          | 1n          |
        | counter.taskTotals("a")                            | 2n          |
        | counter.contributorTotals("a:b", "c")              | 1n          |
        | counter.contributorTotals("a", "b:c")              | 2n          |
        | counter.contributorTotals("a", "c")                | 0n          |
        | counter.taskTotals("__proto__")                    | 3n          |
        | counter.contributorTotals("__proto__", "constructor") | 3n       |
        | counter.contributorTotals("__proto__", "toString") | 0n          |
        | counter.taskTotals(" ")                            | 4n          |

  Rule: Totals are exact bigints; a task or contributor with no reports totals 0n for each

    @happy
    Scenario: A task with no reports totals zero without writing to the store
      When counter.taskTotals("never") resolves to { inputTokens: 0n, outputTokens: 0n, costMicroDollars: 0n }
      And counter.contributorTotals("never", "alice") resolves to { inputTokens: 0n, outputTokens: 0n, costMicroDollars: 0n }
      Then S.set has not been called

    @boundary
    Scenario: Sums beyond Number.MAX_SAFE_INTEGER stay exact
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 9007199254740991, outputTokens: 9007199254740991, costMicroDollars: 9007199254740991 }) resolves
      And counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 9007199254740991, outputTokens: 1, costMicroDollars: 2 }) resolves
      Then counter.taskTotals("t1") resolves to { inputTokens: 18014398509481982n, outputTokens: 9007199254740992n, costMicroDollars: 9007199254740993n }

    @boundary
    Scenario: Each query returns a fresh object with exactly the three bigint fields
      Given counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 2, costMicroDollars: 3 }) has resolved
      When "first" is the value counter.taskTotals("t1") resolves to
      And first.inputTokens is set to 999n
      Then counter.taskTotals("t1") resolves to { inputTokens: 1n, outputTokens: 2n, costMicroDollars: 3n }
      And Object.keys of that value is ["inputTokens", "outputTokens", "costMicroDollars"]
      And typeof each of its fields is "bigint"

  Rule: A report is validated before the store is touched; an invalid report rejects and counts nothing
    # Order of checks: the report itself, then taskId, contributorId, inputTokens,
    # outputTokens, costMicroDollars. The first failing check decides the error.
    # TypeError when a value has the wrong JavaScript type; RangeError when it has
    # the right type but a disallowed value. The error message contains the name
    # of the offending field (or "report" for the report itself).
    # A count must satisfy Number.isSafeInteger(count) && count >= 0, so -0 is
    # accepted as 0 and whole numbers above 9007199254740991 are rejected because
    # they may already have been rounded. Extra properties are ignored.
    # report() never throws synchronously; it returns a rejected promise.

    @unhappy
    Scenario Outline: An invalid report rejects with the decided error and changes nothing
      Given counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }) has resolved
      And S.get and S.set call counts are reset to 0
      When counter.report(<report>) is called
      Then it rejects with a <error> whose message contains "<field>"
      And S.get and S.set have not been called
      And counter.taskTotals("t1") resolves to { inputTokens: 1n, outputTokens: 1n, costMicroDollars: 1n }
      And counter.contributorTotals("t1", "alice") resolves to { inputTokens: 1n, outputTokens: 1n, costMicroDollars: 1n }

      Examples:
        | report                                                                                                    | error      | field            |
        | null                                                                                                      | TypeError  | report           |
        | undefined                                                                                                 | TypeError  | report           |
        | "t1"                                                                                                      | TypeError  | report           |
        | { taskId: "", contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }              | RangeError | taskId           |
        | { taskId: 1, contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }               | TypeError  | taskId           |
        | { contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }                          | TypeError  | taskId           |
        | { taskId: "t1", contributorId: "", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }                 | RangeError | contributorId    |
        | { taskId: "t1", contributorId: null, inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }               | TypeError  | contributorId    |
        | { taskId: "t1", contributorId: "alice", inputTokens: -1, outputTokens: 1, costMicroDollars: 1 }           | RangeError | inputTokens      |
        | { taskId: "t1", contributorId: "alice", inputTokens: 1.5, outputTokens: 1, costMicroDollars: 1 }          | RangeError | inputTokens      |
        | { taskId: "t1", contributorId: "alice", inputTokens: NaN, outputTokens: 1, costMicroDollars: 1 }          | RangeError | inputTokens      |
        | { taskId: "t1", contributorId: "alice", inputTokens: Infinity, outputTokens: 1, costMicroDollars: 1 }     | RangeError | inputTokens      |
        | { taskId: "t1", contributorId: "alice", inputTokens: 9007199254740992, outputTokens: 1, costMicroDollars: 1 } | RangeError | inputTokens  |
        | { taskId: "t1", contributorId: "alice", inputTokens: "1", outputTokens: 1, costMicroDollars: 1 }          | TypeError  | inputTokens      |
        | { taskId: "t1", contributorId: "alice", inputTokens: 1n, outputTokens: 1, costMicroDollars: 1 }           | TypeError  | inputTokens      |
        | { taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: -0.5, costMicroDollars: 1 }         | RangeError | outputTokens     |
        | { taskId: "t1", contributorId: "alice", inputTokens: 1, costMicroDollars: 1 }                             | TypeError  | outputTokens     |
        | { taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: -Infinity }    | RangeError | costMicroDollars |
        | { taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: null }         | TypeError  | costMicroDollars |
        | { taskId: "", contributorId: "", inputTokens: -1, outputTokens: -1, costMicroDollars: -1 }                | RangeError | taskId           |

    @boundary
    Scenario Outline: Boundary counts are accepted
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: <count>, outputTokens: 0, costMicroDollars: 0 }) resolves
      Then counter.taskTotals("t1") resolves to { inputTokens: <total>, outputTokens: 0n, costMicroDollars: 0n }

      Examples:
        | count            | total             |
        | 0                | 0n                |
        | -0               | 0n                |
        | 9007199254740991 | 9007199254740991n |

    @boundary
    Scenario: Extra properties on a report are ignored
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 2, costMicroDollars: 3, model: "x", cachedTokens: 50 }) resolves
      Then counter.taskTotals("t1") resolves to { inputTokens: 1n, outputTokens: 2n, costMicroDollars: 3n }

  Rule: Query ids are validated the same way as report ids

    @unhappy
    Scenario Outline: An invalid query id rejects without touching the store
      When <query> is called
      Then it rejects with a <error> whose message contains "<field>"
      And S.get has not been called

      Examples:
        | query                                  | error      | field         |
        | counter.taskTotals("")                 | RangeError | taskId        |
        | counter.taskTotals(undefined)          | TypeError  | taskId        |
        | counter.contributorTotals("", "alice") | RangeError | taskId        |
        | counter.contributorTotals("t1", "")    | RangeError | contributorId |
        | counter.contributorTotals("t1", 7)     | TypeError  | contributorId |

  Rule: Each task is saved under the key "usage:" + taskId as a JSON-safe record, one get and one set per report
    # Record layout, every count a decimal string with no sign, no leading zeros
    # (except "0") and no other characters:
    #   { inputTokens: "<n>", outputTokens: "<n>", costMicroDollars: "<n>",
    #     contributors: [ { contributorId: "<id>", inputTokens: "<n>",
    #                       outputTokens: "<n>", costMicroDollars: "<n>" }, ... ] }
    # contributors holds one entry per contributor id, in the order each
    # contributor first reported on the task. A report calls S.get("usage:" +
    # taskId) exactly once and then, on success, S.set("usage:" + taskId, record)
    # exactly once, with a new object that the counter never mutates afterwards.
    # taskTotals and contributorTotals call S.get("usage:" + taskId) exactly once
    # and never call S.set. The constructor calls neither.

    @happy
    Scenario: The saved record after two contributors report
      When these reports are made one after another, each awaited:
        | taskId | contributorId | inputTokens | outputTokens | costMicroDollars |
        | t1     | bob           | 40          | 5            | 90               |
        | t1     | alice         | 100         | 20           | 350              |
        | t1     | bob           | 1           | 0            | 10               |
      Then S.get("usage:t1") resolves to a value deeply equal to:
        """
        {
          "inputTokens": "141",
          "outputTokens": "25",
          "costMicroDollars": "450",
          "contributors": [
            { "contributorId": "bob",   "inputTokens": "41",  "outputTokens": "5",  "costMicroDollars": "100" },
            { "contributorId": "alice", "inputTokens": "100", "outputTokens": "20", "costMicroDollars": "350" }
          ]
        }
        """
      And S.set has been called exactly 3 times, each time with key "usage:t1"
      And S.get has been called exactly 3 times, each time with key "usage:t1"

    @happy
    Scenario: The record survives JSON round-tripping by the store
      Given a store "J" whose set saves JSON.stringify(value) and whose get returns JSON.parse of the saved string
      And a UsageCounter "c" created with new UsageCounter(J)
      When c.report({ taskId: "t1", contributorId: "alice", inputTokens: 9007199254740991, outputTokens: 9007199254740991, costMicroDollars: 1 }) resolves
      And c.report({ taskId: "t1", contributorId: "alice", inputTokens: 9007199254740991, outputTokens: 1, costMicroDollars: 1 }) resolves
      Then c.taskTotals("t1") resolves to { inputTokens: 18014398509481982n, outputTokens: 9007199254740992n, costMicroDollars: 2n }

    @boundary
    Scenario: Constructing a counter does not touch the store
      When new UsageCounter(S) is created
      Then S.get and S.set have not been called

    @unhappy
    Scenario Outline: The constructor rejects something that is not a store
      When new UsageCounter(<store>) is called
      Then it throws a TypeError whose message contains "store"

      Examples:
        | store                          |
        | undefined                      |
        | null                           |
        | {}                             |
        | { get: async () => undefined } |
        | { set: async () => {} }        |

  Rule: A new counter over the same store sees and continues the totals already counted

    @happy
    Scenario: Totals survive a restart
      Given counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 100, outputTokens: 20, costMicroDollars: 350 }) has resolved
      And counter.report({ taskId: "t1", contributorId: "bob", inputTokens: 40, outputTokens: 5, costMicroDollars: 90 }) has resolved
      When a new UsageCounter "restarted" is created with new UsageCounter(S)
      Then restarted.taskTotals("t1") resolves to { inputTokens: 140n, outputTokens: 25n, costMicroDollars: 440n }
      And restarted.contributorTotals("t1", "bob") resolves to { inputTokens: 40n, outputTokens: 5n, costMicroDollars: 90n }
      When restarted.report({ taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }) resolves
      Then restarted.contributorTotals("t1", "alice") resolves to { inputTokens: 101n, outputTokens: 21n, costMicroDollars: 351n }

    @happy
    Scenario: The store is the source of truth, so counters taking turns over one store see each other's reports
      Given a second UsageCounter "other" created with new UsageCounter(S)
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 0, costMicroDollars: 0 }) resolves
      And other.report({ taskId: "t1", contributorId: "alice", inputTokens: 2, outputTokens: 0, costMicroDollars: 0 }) resolves
      And counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 4, outputTokens: 0, costMicroDollars: 0 }) resolves
      Then counter.taskTotals("t1") resolves to { inputTokens: 7n, outputTokens: 0n, costMicroDollars: 0n }
      And other.taskTotals("t1") resolves to { inputTokens: 7n, outputTokens: 0n, costMicroDollars: 0n }
      # Overlapping reports on the same task through two different counters are
      # not coordinated and may lose updates; only one counter at a time may
      # write a given task.

    @unhappy
    Scenario Outline: A saved value that is not a valid record rejects instead of being overwritten
      Given S holds <value> under the key "usage:t1"
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }) is called
      Then it rejects with an Error whose message contains "usage:t1"
      And S.set has not been called
      And counter.taskTotals("t1") rejects with an Error whose message contains "usage:t1"
      And counter.contributorTotals("t1", "alice") rejects with an Error whose message contains "usage:t1"
      And counter.taskTotals("t2") resolves to { inputTokens: 0n, outputTokens: 0n, costMicroDollars: 0n }

      Examples:
        | value                                                                                         |
        | null                                                                                          |
        | "141"                                                                                         |
        | { inputTokens: "1", outputTokens: "1", costMicroDollars: "1" }                                |
        | { inputTokens: 1, outputTokens: "1", costMicroDollars: "1", contributors: [] }                |
        | { inputTokens: "-1", outputTokens: "1", costMicroDollars: "1", contributors: [] }             |
        | { inputTokens: "01", outputTokens: "1", costMicroDollars: "1", contributors: [] }             |
        | { inputTokens: "1.0", outputTokens: "1", costMicroDollars: "1", contributors: [] }            |
        | { inputTokens: "1", outputTokens: "1", costMicroDollars: "1", contributors: [{ contributorId: "", inputTokens: "1", outputTokens: "1", costMicroDollars: "1" }] } |
        | { inputTokens: "1", outputTokens: "1", costMicroDollars: "1", contributors: [{ contributorId: "a", inputTokens: "1", outputTokens: "1", costMicroDollars: "1" }, { contributorId: "a", inputTokens: "0", outputTokens: "0", costMicroDollars: "0" }] } |

  Rule: If the store rejects, the call rejects with the store's own error and counts nothing

    @unhappy
    Scenario: A rejected set leaves every total unchanged
      Given counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 10, outputTokens: 10, costMicroDollars: 10 }) has resolved
      And the next S.set rejects with the error object "boom" without saving
      When counter.report({ taskId: "t1", contributorId: "bob", inputTokens: 5, outputTokens: 5, costMicroDollars: 5 }) is called
      Then it rejects with that same "boom" object
      And counter.taskTotals("t1") resolves to { inputTokens: 10n, outputTokens: 10n, costMicroDollars: 10n }
      And counter.contributorTotals("t1", "alice") resolves to { inputTokens: 10n, outputTokens: 10n, costMicroDollars: 10n }
      And counter.contributorTotals("t1", "bob") resolves to { inputTokens: 0n, outputTokens: 0n, costMicroDollars: 0n }

    @unhappy
    Scenario: A report after a rejected set builds on the last saved totals
      Given the next S.set rejects with the error object "boom" without saving
      And counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 5, outputTokens: 0, costMicroDollars: 0 }) has rejected with "boom"
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 2, outputTokens: 0, costMicroDollars: 0 }) resolves
      Then counter.taskTotals("t1") resolves to { inputTokens: 2n, outputTokens: 0n, costMicroDollars: 0n }

    @unhappy
    Scenario: A rejected get rejects the call with the store's error and does not call set
      Given the next S.get rejects with the error object "offline"
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 1, costMicroDollars: 1 }) is called
      Then it rejects with that same "offline" object
      And S.set has not been called
      And counter.taskTotals("t1") resolves to { inputTokens: 0n, outputTokens: 0n, costMicroDollars: 0n }

    @unhappy
    Scenario: A query rejects with the store's error when get rejects
      Given the next S.get rejects with the error object "offline"
      When counter.taskTotals("t1") is called
      Then it rejects with that same "offline" object

  Rule: Calls on the same task run one at a time in call order; calls on different tasks do not wait for each other
    # Each counter keeps a FIFO queue per taskId. report, taskTotals and
    # contributorTotals for a task each join the back of that task's queue when
    # called and start (call S.get) only once every earlier call on that task
    # has settled, whether it resolved or rejected. A query therefore reflects
    # exactly the reports on its task that were called before it and resolved.
    # Invalid calls are rejected at once and never join a queue.

    @concurrency
    Scenario: Overlapping reports on one task are all counted
      Given S.get and S.set each resolve after a random delay of 0 to 5 ms
      When 100 calls of counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 2, costMicroDollars: 3 }) are started without awaiting and all resolve
      Then counter.taskTotals("t1") resolves to { inputTokens: 100n, outputTokens: 200n, costMicroDollars: 300n }
      And counter.contributorTotals("t1", "alice") resolves to { inputTokens: 100n, outputTokens: 200n, costMicroDollars: 300n }

    @concurrency
    Scenario: A second report on the same task waits for the first to be saved
      Given S.set calls are held until released by the test
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 0, costMicroDollars: 0 }) is called as "first"
      And counter.report({ taskId: "t1", contributorId: "bob", inputTokens: 2, outputTokens: 0, costMicroDollars: 0 }) is called as "second"
      Then S.get has been called once and S.set has been called once, for "first"
      And neither "first" nor "second" has settled
      When the held S.set is released
      Then "first" resolves
      And S.get is then called for "second" and S.set is called with inputTokens "3"
      When that S.set is released
      Then "second" resolves
      And counter.taskTotals("t1") resolves to { inputTokens: 3n, outputTokens: 0n, costMicroDollars: 0n }

    @concurrency
    Scenario: Reports on different tasks do not wait for each other
      Given S.set for key "usage:slow" is held until released by the test
      When counter.report({ taskId: "slow", contributorId: "alice", inputTokens: 1, outputTokens: 0, costMicroDollars: 0 }) is called as "held"
      And counter.report({ taskId: "fast", contributorId: "alice", inputTokens: 2, outputTokens: 0, costMicroDollars: 0 }) is called
      Then the "fast" report resolves while "held" is still pending
      And counter.taskTotals("fast") resolves to { inputTokens: 2n, outputTokens: 0n, costMicroDollars: 0n } while "held" is still pending
      When the held S.set is released
      Then "held" resolves
      And counter.taskTotals("slow") resolves to { inputTokens: 1n, outputTokens: 0n, costMicroDollars: 0n }

    @concurrency
    Scenario Outline: A query made while a report on its task is pending waits for it
      Given S.set calls are held until released by the test
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 5, outputTokens: 0, costMicroDollars: 0 }) is called as "pending"
      And counter.taskTotals("t1") is called as "query" before "pending" settles
      Then "query" has not settled
      When the held S.set <outcome>
      Then "pending" <result>
      And "query" resolves to { inputTokens: <total>, outputTokens: 0n, costMicroDollars: 0n }

      Examples:
        | outcome                                   | result                 | total |
        | is released                               | resolves               | 5n    |
        | rejects with "boom" without saving        | rejects with "boom"    | 0n    |

    @concurrency
    Scenario: A failure in the middle of overlapping reports affects only that report
      Given the second S.set call rejects with the error object "boom" without saving
      When these reports on task "t1" by "alice" are started in this order without awaiting:
        | name | inputTokens |
        | r1   | 1           |
        | r2   | 10          |
        | r3   | 100         |
      Then r1 resolves, r2 rejects with that same "boom" object, and r3 resolves
      And counter.taskTotals("t1") resolves to { inputTokens: 101n, outputTokens: 0n, costMicroDollars: 0n }

    @concurrency
    Scenario: An invalid report does not join the queue
      Given S.set calls are held until released by the test
      When counter.report({ taskId: "t1", contributorId: "alice", inputTokens: 1, outputTokens: 0, costMicroDollars: 0 }) is called as "pending"
      And counter.report({ taskId: "t1", contributorId: "alice", inputTokens: -1, outputTokens: 0, costMicroDollars: 0 }) is called
      Then the invalid report rejects with a RangeError while "pending" is still pending
```

Decided:
- Store layout: one key per task, `"usage:" + taskId`, holding task totals and an ordered `contributors` array, so a report is saved with a single `set` and is either counted everywhere or nowhere.
- Stored counts are canonical decimal strings, so records survive JSON stores and stay exact past 2^53.
- Contributor entries are ordered by each contributor's first report on the task.
- Store call counts: one `get` + one `set` per report, one `get` per query, no store calls in the constructor or for invalid input.
- The counter keeps no cache; it reads the store for every call, so counters that take turns over one store see each other's reports. Overlapping writes to one task through two different counters are not coordinated.
- A saved value that isn't a valid record makes calls on that task reject with an `Error` naming the key, and is never overwritten.
- If `get` rejects, the call rejects with the store's own error and `set` is not called.
- A rejected `set` rejects with the very same error object, and later reports build on the last saved totals.
- Validation: `TypeError` for a wrong type, `RangeError` for a disallowed value. Checks run in field order, the first failure wins, and the message names the field.
- Empty id means exactly `""`. Whitespace-only ids are valid, and ids are case- and whitespace-sensitive.
- A count must be `Number.isSafeInteger` and `>= 0`. `-0` counts as 0, and values above 9007199254740991, `NaN`, `±Infinity`, strings and bigints are rejected.
- Extra properties on a report are ignored.
- All-zero reports are accepted and saved. Duplicate reports are counted each time (no dedup).
- Query ids are validated like report ids (empty → `RangeError`, non-string → `TypeError`).
- The constructor throws `TypeError` if `store` lacks `get`/`set` functions.
- Queries return a fresh object with exactly the three bigint fields.
- Ordering: there is a FIFO queue per task inside each counter covering reports and queries. A query waits for earlier pending reports on its task, a failed call doesn't block later ones, and different tasks never wait for each other.
- `report` never throws synchronously; it always returns a promise.
