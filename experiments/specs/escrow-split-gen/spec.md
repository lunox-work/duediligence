# Release the escrow in two parts

A task's bounty is locked in escrow when the task is posted. Today it stays
fully locked until merge. This change releases it in two parts. The first part
is the hidden-test share (by default 75%, given in basis points), released when
the hidden test run passes (Gate 2). The second part is the rest of the bounty,
released when the maintainer approves UAT on the merge-back PR (Gate 3). The
payment worker delivers gate events at least once, so it may deliver the same
event more than once, and two deliveries may overlap. Each part of the money
must move exactly once. The interface is `src/index.ts`: `splitBounty` works
out the two amounts, and `createEscrowHandler` returns an `EscrowHandler`. Its
`handle` method records releases in the caller's `EscrowStore`.

```gherkin
Feature: Two-part escrow release

  Background:
    Given an in-memory EscrowStore whose get resolves to the last state passed to set, or undefined when set has never been called
    And the store counts its get and set calls

  Rule: splitBounty returns hiddenTests = floor(bounty × hiddenTestShareBps / 10000) and uat = bounty − hiddenTests, computed exactly (no floating-point error) for every bounty from 0 to Number.MAX_SAFE_INTEGER

    @happy
    Scenario Outline: Splitting a bounty
      When splitBounty(<bounty>, <bps>) is called
      Then it returns { hiddenTests: <hiddenTests>, uat: <uat> }

      Examples:
        | bounty | bps   | hiddenTests | uat |
        | 1000   | 7500  | 750         | 250 |
        | 999    | 7500  | 749         | 250 |
        | 100    | 3333  | 33          | 67  |
        | 10000  | 1     | 1           | 9999 |

    @boundary
    Scenario Outline: Rounding down, zero shares and zero bounties
      When splitBounty(<bounty>, <bps>) is called
      Then it returns { hiddenTests: <hiddenTests>, uat: <uat> }

      Examples:
        | bounty | bps   | hiddenTests | uat  |
        | 1      | 7500  | 0           | 1    |
        | 3      | 7500  | 2           | 1    |
        | 9999   | 1     | 0           | 9999 |
        | 1000   | 0     | 0           | 1000 |
        | 1000   | 10000 | 1000        | 0    |
        | 0      | 7500  | 0           | 0    |
        | 0      | 0     | 0           | 0    |
        | 0      | 10000 | 0           | 0    |

    @boundary
    Scenario Outline: Exact at the top of the safe-integer range, where float arithmetic would be off by one
      When splitBounty(<bounty>, <bps>) is called
      Then it returns { hiddenTests: <hiddenTests>, uat: <uat> }
      And hiddenTests + uat equals <bounty> exactly

      Examples:
        | bounty           | bps   | hiddenTests      | uat              |
        | 9007199254740991 | 7500  | 6755399441055743 | 2251799813685248 |
        | 9007199254740991 | 232   | 208967022709990  | 8798232232031001 |
        | 9007199254740991 | 9999  | 9006298534815516 | 900719925475     |
        | 4503599627370497 | 7500  | 3377699720527872 | 1125899906842625 |
        | 9007199254740991 | 10000 | 9007199254740991 | 0                |
        | 9007199254740991 | 0     | 0                | 9007199254740991 |

    @boundary
    Scenario: Negative zero is accepted as zero and never returned
      When splitBounty(-0, 7500) is called
      Then it returns { hiddenTests: 0, uat: 0 }
      And neither field is -0 (Object.is(field, 0) is true)

  Rule: splitBounty throws synchronously on invalid arguments. It throws TypeError when an argument is not of type number, and RangeError when a number is not an integer in range: bounty must satisfy Number.isSafeInteger and be at least 0, and hiddenTestShareBps must be an integer from 0 to 10000. The message names the parameter ("bounty" or "hiddenTestShareBps"). bounty is checked first.

    @unhappy
    Scenario Outline: Rejected bounty
      When splitBounty(<bounty>, 7500) is called
      Then it throws a <error> whose message contains "bounty"

      Examples:
        | bounty           | error      |
        | -1               | RangeError |
        | 1.5              | RangeError |
        | NaN              | RangeError |
        | Infinity         | RangeError |
        | 9007199254740992 | RangeError |
        | "1000"           | TypeError  |
        | undefined        | TypeError  |
        | null             | TypeError  |
        | 1000n            | TypeError  |

    @unhappy
    Scenario Outline: Rejected share
      When splitBounty(1000, <bps>) is called
      Then it throws a <error> whose message contains "hiddenTestShareBps"

      Examples:
        | bps       | error      |
        | -1        | RangeError |
        | 10001     | RangeError |
        | 75.5      | RangeError |
        | NaN       | RangeError |
        | Infinity  | RangeError |
        | "7500"    | TypeError  |
        | undefined | TypeError  |
        | null      | TypeError  |

    @unhappy
    Scenario: Both arguments invalid reports the bounty
      When splitBounty(-1, 10001) is called
      Then it throws a RangeError whose message contains "bounty"

  Rule: createEscrowHandler validates the task synchronously and does not touch the store. hiddenTestShareBps defaults to 7500 only when it is undefined or absent. Invalid values throw the same errors as splitBounty, naming "bounty" or "hiddenTestShareBps". A task that is not a non-null object throws TypeError.

    @happy
    Scenario: Creating a handler reads and writes nothing
      When createEscrowHandler({ bounty: 1000 }, store) is called
      Then it returns an EscrowHandler
      And the store has had 0 get calls and 0 set calls

    @unhappy
    Scenario Outline: Invalid task
      When createEscrowHandler(<task>, store) is called
      Then it throws a <error> whose message contains "<name>"

      Examples:
        | task                                         | error      | name               |
        | { bounty: -5 }                               | RangeError | bounty             |
        | { bounty: 10.5 }                             | RangeError | bounty             |
        | { bounty: "1000" }                           | TypeError  | bounty             |
        | { bounty: 1000, hiddenTestShareBps: 10001 }  | RangeError | hiddenTestShareBps |
        | { bounty: 1000, hiddenTestShareBps: -1 }     | RangeError | hiddenTestShareBps |
        | { bounty: 1000, hiddenTestShareBps: null }   | TypeError  | hiddenTestShareBps |
        | { bounty: 1000, hiddenTestShareBps: "7500" } | TypeError  | hiddenTestShareBps |

    @unhappy
    Scenario Outline: Task that is not an object
      When createEscrowHandler(<task>, store) is called
      Then it throws a TypeError

      Examples:
        | task      |
        | null      |
        | undefined |
        | 1000      |

  Rule: handle validates the event before touching the store. The event must be a non-null object, its id a non-empty string, and its kind one of "hidden-tests-passed", "hidden-tests-failed", "uat-approved". Otherwise handle returns a promise rejected with a TypeError. It never throws synchronously. The rejection does not wait for calls already in progress, and the store is not called.

    @unhappy
    Scenario Outline: Invalid event
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      When handler.handle(<event>) is called
      Then it returns a promise that rejects with a TypeError
      And the store has had 0 get calls and 0 set calls

      Examples:
        | event                                    |
        | null                                     |
        | "hidden-tests-passed"                    |
        | { kind: "hidden-tests-passed" }          |
        | { id: "", kind: "hidden-tests-passed" }  |
        | { id: 7, kind: "hidden-tests-passed" }   |
        | { id: "e1" }                             |
        | { id: "e1", kind: "tests-passed" }       |
        | { id: "e1", kind: "UAT-APPROVED" }       |

  Rule: An empty store (get resolves to undefined) means { status: "locked", releases: [] } for a bounty above 0, and { status: "pro bono", releases: [] } for a bounty of 0. Otherwise the stored state is used as it is, without validation. handle calls get exactly once per valid event and set at most once. set is called only when a release is recorded, with the whole new state. handle resolves to a new object deep-equal to the state after the event, and never mutates the object get returned.

    @happy
    Scenario: A failed run on a fresh task releases nothing and writes nothing
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      When handler.handle({ id: "e1", kind: "hidden-tests-failed" }) is called
      Then it resolves to { status: "locked", releases: [] }
      And the store has had 1 get call and 0 set calls
      And store.get() still resolves to undefined

    @happy
    Scenario: The stored state is what the handler continues from
      Given the store holds { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }
      And handler = createEscrowHandler({ bounty: 1000 }, store)
      When handler.handle({ id: "e9", kind: "hidden-tests-passed" }) is called
      Then it resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }
      And the store has had 0 set calls

    @boundary
    Scenario: The resolved state is a copy
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      And handler.handle({ id: "e1", kind: "hidden-tests-passed" }) resolved to state S
      When S.releases is emptied by the caller
      Then store.get() still resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }

  Rule: "hidden-tests-passed" records { kind: "hidden-tests", amount: splitBounty(bounty, hiddenTestShareBps).hiddenTests } and sets status to "partially released". It does this only if no "hidden-tests" release is recorded yet. A zero amount is still recorded. The status stays "partially released" even when the UAT remainder is 0.

    @happy
    Scenario Outline: Hidden-test release uses the configured share of the bounty
      Given handler = createEscrowHandler(<task>, store)
      When handler.handle({ id: "e1", kind: "hidden-tests-passed" }) is called
      Then it resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: <amount> }] }
      And set was called once with that state

      Examples:
        | task                                       | amount |
        | { bounty: 1000 }                           | 750    |
        | { bounty: 999 }                            | 749    |
        | { bounty: 2000, hiddenTestShareBps: 5000 } | 1000   |
        | { bounty: 100, hiddenTestShareBps: 3333 }  | 33     |

    @boundary
    Scenario Outline: Zero-amount and whole-bounty hidden-test releases
      Given handler = createEscrowHandler(<task>, store)
      When handler.handle({ id: "e1", kind: "hidden-tests-passed" }) is called
      Then it resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: <amount> }] }

      Examples:
        | task                                        | amount |
        | { bounty: 1 }                               | 0      |
        | { bounty: 1000, hiddenTestShareBps: 0 }     | 0      |
        | { bounty: 1000, hiddenTestShareBps: 10000 } | 1000   |

  Rule: Each release happens at most once per task. A repeated "hidden-tests-passed", with the same id or a different id, records nothing and resolves to the current state without calling set. Repeats are detected by the releases already recorded, not by event id; the id is not stored.

    @boundary
    Scenario Outline: Repeated pass events release nothing more
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      And handler.handle({ id: "e1", kind: "hidden-tests-passed" }) has resolved
      When handler.handle({ id: "<id>", kind: "hidden-tests-passed" }) is called
      Then it resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }
      And set has been called 1 time in total

      Examples:
        | id |
        | e1 |
        | e2 |

    @boundary
    Scenario: A new handler over the same store does not release again
      Given createEscrowHandler({ bounty: 1000 }, store).handle({ id: "e1", kind: "hidden-tests-passed" }) has resolved
      When createEscrowHandler({ bounty: 1000 }, store).handle({ id: "e1", kind: "hidden-tests-passed" }) is called
      Then it resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }

  Rule: "hidden-tests-failed" never records anything and never rejects for a valid event. It does not block a later pass and does not reverse an earlier release.

    @unhappy
    Scenario: A failed run then a passing rerun releases the share once
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      When handler.handle({ id: "e1", kind: "hidden-tests-failed" }) resolves to { status: "locked", releases: [] }
      And handler.handle({ id: "e2", kind: "hidden-tests-passed" }) is called
      Then it resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }

    @unhappy
    Scenario Outline: A failed run after a release changes nothing
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      And the events <before> have been handled in order
      When handler.handle({ id: "f1", kind: "hidden-tests-failed" }) is called
      Then it resolves to <state>
      And no further set call is made

      Examples:
        | before                                         | state                                                                                                                  |
        | hidden-tests-passed                            | { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }                                    |
        | hidden-tests-passed, uat-approved              | { status: "fully released", releases: [{ kind: "hidden-tests", amount: 750 }, { kind: "uat", amount: 250 }] }          |

  Rule: "uat-approved" requires a recorded "hidden-tests" release. If there is one and no "uat" release yet, it records { kind: "uat", amount: bounty − (sum of the amounts already recorded) }, appended after the hidden-test release, and sets status to "fully released". A zero amount is still recorded. A repeated "uat-approved" records nothing and resolves to the current state. Any event after "fully released" records nothing.

    @happy
    Scenario Outline: UAT approval releases the remaining balance
      Given handler = createEscrowHandler(<task>, store)
      And handler.handle({ id: "e1", kind: "hidden-tests-passed" }) has resolved
      When handler.handle({ id: "e2", kind: "uat-approved" }) is called
      Then it resolves to { status: "fully released", releases: [{ kind: "hidden-tests", amount: <first> }, { kind: "uat", amount: <rest> }] }
      And set has been called 2 times in total

      Examples:
        | task                                         | first | rest |
        | { bounty: 1000 }                             | 750   | 250  |
        | { bounty: 999 }                              | 749   | 250  |
        | { bounty: 1 }                                | 0     | 1    |
        | { bounty: 1000, hiddenTestShareBps: 0 }      | 0     | 1000 |
        | { bounty: 1000, hiddenTestShareBps: 10000 }  | 1000  | 0    |

    @boundary
    Scenario: The remainder is what is left in escrow, not a recomputed share
      Given the store holds { status: "partially released", releases: [{ kind: "hidden-tests", amount: 700 }] }
      And handler = createEscrowHandler({ bounty: 1000 }, store)
      When handler.handle({ id: "e2", kind: "uat-approved" }) is called
      Then it resolves to { status: "fully released", releases: [{ kind: "hidden-tests", amount: 700 }, { kind: "uat", amount: 300 }] }

    @boundary
    Scenario Outline: Events after full release record nothing
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      And hidden-tests-passed then uat-approved have been handled
      When handler.handle({ id: "x", kind: "<kind>" }) is called
      Then it resolves to { status: "fully released", releases: [{ kind: "hidden-tests", amount: 750 }, { kind: "uat", amount: 250 }] }
      And set has been called 2 times in total

      Examples:
        | kind                |
        | uat-approved        |
        | hidden-tests-passed |
        | hidden-tests-failed |

    @unhappy
    Scenario Outline: UAT approval before the hidden-test share is released is rejected
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      And the events <before> have been handled in order
      When handler.handle({ id: "u1", kind: "uat-approved" }) is called
      Then it rejects with an Error whose message contains "hidden tests have not passed"
      And set has not been called
      And a later hidden-tests-passed then uat-approved still release 750 then 250

      Examples:
        | before              |
        | (none)              |
        | hidden-tests-failed |

  Rule: A task with a bounty of 0 is "pro bono". Every valid event resolves to { status: "pro bono", releases: [] } and records nothing. set is never called, and "uat-approved" is not rejected.

    @boundary
    Scenario Outline: Pro bono task
      Given handler = createEscrowHandler({ bounty: 0 }, store)
      When handler.handle({ id: "e1", kind: "<kind>" }) is called
      Then it resolves to { status: "pro bono", releases: [] }
      And set has not been called

      Examples:
        | kind                |
        | hidden-tests-passed |
        | hidden-tests-failed |
        | uat-approved        |

  Rule: When store.get or store.set rejects, or throws, handle rejects with that same error object. A get failure means set is not called. Nothing is cached in the handler, so the same event can be handled again later and records as if the failed attempt never happened. A store failure does not block later calls.

    @unhappy
    Scenario Outline: Store failure, then a retry
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      And store.<method> rejects once with error E, then behaves normally
      When handler.handle({ id: "e1", kind: "hidden-tests-passed" }) is called
      Then it rejects with E itself
      And store.get() resolves to undefined
      When handler.handle({ id: "e1", kind: "hidden-tests-passed" }) is called again
      Then it resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }

      Examples:
        | method |
        | get    |
        | set    |

    @unhappy
    Scenario: Store failure during UAT leaves the hidden-test release in place
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      And handler.handle({ id: "e1", kind: "hidden-tests-passed" }) has resolved
      And store.set rejects once with error E
      When handler.handle({ id: "e2", kind: "uat-approved" }) is called
      Then it rejects with E
      And store.get() resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }
      When handler.handle({ id: "e2", kind: "uat-approved" }) is called again
      Then it resolves to { status: "fully released", releases: [{ kind: "hidden-tests", amount: 750 }, { kind: "uat", amount: 250 }] }

  Rule: The handle calls of one handler run one at a time, in the order they were called. Each call's get starts only after the previous call has settled, whether it resolved or rejected. Overlapping deliveries therefore behave exactly as if they were made in sequence. Overlap is guaranteed safe only within one handler; using two handlers on one store at the same time is not supported.

    @concurrency
    Scenario: The same event delivered twice at the same time releases once
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      And the store's get and set each resolve only after a macrotask delay
      When handler.handle({ id: "e1", kind: "hidden-tests-passed" }) is called twice without awaiting
      Then both resolve to { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }
      And set has been called 1 time in total

    @concurrency
    Scenario: Duplicate UAT approvals at the same time release the rest once
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      And handler.handle({ id: "e1", kind: "hidden-tests-passed" }) has resolved
      When handler.handle({ id: "e2", kind: "uat-approved" }) is called three times without awaiting
      Then all three resolve to { status: "fully released", releases: [{ kind: "hidden-tests", amount: 750 }, { kind: "uat", amount: 250 }] }
      And set has been called 2 times in total

    @concurrency
    Scenario: Overlapping pass and approval, in that order, both succeed
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      When handler.handle({ id: "e1", kind: "hidden-tests-passed" }) and then handler.handle({ id: "e2", kind: "uat-approved" }) are called without awaiting
      Then the first resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }
      And the second resolves to { status: "fully released", releases: [{ kind: "hidden-tests", amount: 750 }, { kind: "uat", amount: 250 }] }

    @concurrency
    Scenario: Overlapping approval and pass, in that order, reject the approval
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      When handler.handle({ id: "e2", kind: "uat-approved" }) and then handler.handle({ id: "e1", kind: "hidden-tests-passed" }) are called without awaiting
      Then the first rejects with an Error whose message contains "hidden tests have not passed"
      And the second resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }

    @concurrency
    Scenario: A store failure does not block the calls queued behind it
      Given handler = createEscrowHandler({ bounty: 1000 }, store)
      And store.set rejects once with error E, after a macrotask delay
      When handler.handle({ id: "e1", kind: "hidden-tests-passed" }) is called twice without awaiting
      Then the first rejects with E
      And the second resolves to { status: "partially released", releases: [{ kind: "hidden-tests", amount: 750 }] }
      And store.get() resolves to that same state
```

Decided:
- Split arithmetic: exact integer math (no floating-point error) over the whole safe-integer range; hidden-test part rounded down, UAT part is the rest; -0 counts as 0 and is never returned.
- Argument validation: TypeError when an argument is not a number, RangeError when it is out of range or not an integer; the message names the parameter; bounty is checked first.
- Default share: 7500 only when `hiddenTestShareBps` is undefined or absent; `null` is a TypeError.
- When the task is validated: synchronously in `createEscrowHandler`, which does not touch the store.
- Event validation: non-empty string `id` and a known `kind`, else a TypeError rejection, never a synchronous throw, without touching the store or waiting for calls in progress.
- Empty store: treated as "locked" (or "pro bono" for bounty 0); stored state is used as-is, without validation.
- Store traffic: one `get` per valid event; `set` only when a release is recorded, with the whole state; nothing written otherwise.
- Resolved value: a fresh copy; the object from `get` is never mutated.
- Repeats: detected by release kind already recorded, not by event id; the id is not stored.
- Zero-amount releases (bounty 1, share 0 or 10000): recorded, so the gates still progress.
- Status: gate-based; "partially released" after the hidden-test release even if nothing remains, "fully released" only after the UAT release.
- UAT amount: bounty minus the sum already released, not a recomputed share.
- UAT before hidden-test release: rejects with a plain Error ("hidden tests have not passed"), also after a failed run; a later pass then approval still works.
- Failed run: never rejects, never reverses a release, never blocks a later pass.
- Pro bono (bounty 0): no releases, no writes, no ordering rejection.
- Store errors: rejected with the same error object; nothing cached, so a retry records normally; later calls are not blocked.
- Overlapping calls: run one at a time in call order within one handler; two handlers on one store at the same time is not supported.
