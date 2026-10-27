# Invite codes for invite-only tasks

Company-borne tasks are invite only, and the beta needs a way to invite
contributors. An `InviteRegistry` creates single-use invite codes per task;
a contributor who redeems one gains access to that task. Codes expire 14 days
after they are created, can be revoked while unused, and once used they show
who used them and when. Everything the registry keeps lives in the caller's
`Store`; time comes only from `now` and randomness only from `randomInt`.
Contributor accounts are out of scope: contributor and task ids are opaque
strings.

```gherkin
Feature: Invite codes for invite-only tasks

  Background:
    Given an empty store whose "get" and "set" resolve after an arbitrary delay
    And a clock "now" that returns "2026-01-01T00:00:00.000Z" unless a scenario moves it
    And "randomInt" returns the values queued by the scenario, one per call
    And a registry built with "new InviteRegistry({ store, now, randomInt })"

  # ---------------------------------------------------------------------------
  Rule: A code is 8 characters drawn from a fixed 32-character alphabet
    # Alphabet, index 0 to 31: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    # (A-Z without I and O, then the digits 2-9). Each attempt calls
    # randomInt(32) exactly 8 times and maps each result, left to right, to the
    # character at that index. The code is stored and returned in this
    # canonical form: 8 uppercase characters, no separator.

    @happy
    Scenario: Creating a code turns 8 random draws into the canonical code
      Given randomInt is queued with 0, 1, 2, 3, 24, 25, 26, 27
      When create("task-1") is called
      Then it resolves to an InviteCode with:
        | field     | value                    |
        | code      | ABCD2345                 |
        | taskId    | task-1                   |
        | createdAt | 2026-01-01T00:00:00.000Z |
        | expiresAt | 2026-01-15T00:00:00.000Z |
        | state     | unused                   |
      And the result has no "usedBy" key and no "usedAt" key
      And randomInt was called exactly 8 times, each time with bound 32

    @boundary
    Scenario: The first and last alphabet characters are reachable
      Given randomInt is queued with <draws>
      When create("task-1") is called
      Then the code is "<code>"

      Examples:
        | draws                          | code     |
        | 0, 0, 0, 0, 0, 0, 0, 0         | AAAAAAAA |
        | 31, 31, 31, 31, 31, 31, 31, 31 | 99999999 |
        | 7, 8, 12, 13, 23, 24, 30, 31   | HJNPZ289 |

    @unhappy
    Scenario: A randomInt result outside 0..31 or not an integer is rejected
      Given randomInt is queued with 0, 0, 0, <bad>
      When create("task-1") is called
      Then it rejects with a RangeError "randomInt returned an out-of-range value"
      And list("task-1") resolves to []

      Examples:
        | bad |
        | -1  |
        | 32  |
        | 1.5 |
        | NaN |

  # ---------------------------------------------------------------------------
  Rule: A code that repeats any code already in the registry is drawn again, at most 10 attempts
    # Uniqueness is across all tasks and all states (unused, used, expired,
    # revoked). A repeated attempt draws a full new set of 8 values. If 10
    # attempts in a row all repeat existing codes, create rejects with an
    # Error "could not generate a unique code" and stores nothing.

    @happy
    Scenario: A repeated code is redrawn
      Given create("task-1") has produced "AAAAAAAA"
      And randomInt is queued with 0,0,0,0,0,0,0,0 then 1,1,1,1,1,1,1,1
      When create("task-2") is called
      Then the code is "BBBBBBBB"
      And randomInt was called 16 times during that create

    @boundary
    Scenario: Codes of other states and tasks still count as taken
      Given create("task-1") has produced "AAAAAAAA"
      And "AAAAAAAA" has been revoked
      And randomInt is queued with 0,0,0,0,0,0,0,0 then 2,2,2,2,2,2,2,2
      When create("task-9") is called
      Then the code is "CCCCCCCC"

    @boundary
    Scenario: The 10th attempt may still succeed
      Given create("task-1") has produced "AAAAAAAA"
      And randomInt is queued with nine sets of 0,0,0,0,0,0,0,0 then 3,3,3,3,3,3,3,3
      When create("task-1") is called
      Then the code is "DDDDDDDD"

    @unhappy
    Scenario: Ten repeats in a row give up
      Given create("task-1") has produced "AAAAAAAA"
      And randomInt always returns 0
      When create("task-1") is called
      Then it rejects with an Error "could not generate a unique code"
      And randomInt was called 80 times during that create
      And list("task-1") resolves to exactly one code, "AAAAAAAA"

  # ---------------------------------------------------------------------------
  Rule: A code expires exactly 14 days (1,209,600,000 ms) after it was created
    # expiresAt = createdAt + 14 * 24 * 60 * 60 * 1000 ms; no calendar or
    # time-zone adjustment. The clock is read once per create, redeem and
    # list. A code is expired when now >= expiresAt; at the exact instant of
    # expiresAt it is already expired.

    @boundary
    Scenario: Redeeming around the expiry instant
      Given randomInt is queued with 0, 1, 2, 3, 24, 25, 26, 27
      And create("task-1") has produced "ABCD2345" at "2026-01-01T00:00:00.000Z"
      And the clock is moved to "<now>"
      When redeem("ABCD2345", "alice") is called
      Then it resolves to <result>

      Examples:
        | now                      | result                              |
        | 2026-01-14T23:59:59.999Z | { ok: true, taskId: "task-1" }      |
        | 2026-01-15T00:00:00.000Z | { ok: false, reason: "expired" }    |
        | 2026-03-01T00:00:00.000Z | { ok: false, reason: "expired" }    |

    @boundary
    Scenario: Expiry ignores daylight-saving changes
      Given the clock returns "2026-03-20T12:00:00.000Z"
      When create("task-1") is called
      Then expiresAt is "2026-04-03T12:00:00.000Z"

    @unhappy
    Scenario: An invalid date from the clock is rejected
      Given the clock returns new Date(NaN)
      When create("task-1") is called
      Then it rejects with a RangeError "clock returned an invalid date"
      And randomInt was not called
      # redeem and list reject the same way when the clock returns an invalid date

  # ---------------------------------------------------------------------------
  Rule: redeem reads a code however it is typed
    # Before lookup the code is normalized: every whitespace character (as
    # matched by the regular expression \s) and every "-" is removed, then the
    # rest is upper-cased. No other characters are removed or substituted
    # (for example "0" is not read as "O"). Input that does not normalize to an
    # existing code fails with reason "unknown"; it never throws. revoke
    # normalizes its argument the same way.

    @happy
    Scenario: Typed variants of "ABCD2345" redeem the same code
      Given create("task-1") has produced "ABCD2345"
      When redeem("<typed>", "alice") is called
      Then it resolves to { ok: true, taskId: "task-1" }

      Examples:
        | typed          |
        | ABCD2345       |
        | abcd2345       |
        | ABCD-2345      |
        | abcd 2345      |
        |  AbCd - 23 45  |
        | A-B-C-D-2-3-4-5 |

    @unhappy
    Scenario: Input that does not normalize to an existing code is unknown
      Given create("task-1") has produced "ABCD2345"
      When redeem("<typed>", "alice") is called
      Then it resolves to { ok: false, reason: "unknown" }
      And hasAccess("alice", "task-1") resolves to false

      Examples:
        | typed      |
        |            |
        | -          |
        | ABCD234    |
        | ABCD23456  |
        | ABCD_2345  |
        | ABCD.2345  |
        | 0BCD2345   |
        | ZZZZZZZZ   |

  # ---------------------------------------------------------------------------
  Rule: Redeeming an unused, unexpired code uses it and grants access to its task
    # On success the code becomes "used" with usedBy = contributorId and
    # usedAt = the clock's time at redemption, and the contributor gains
    # access to the code's task. Access, once granted, is permanent: nothing
    # in this interface removes it, and it outlives the code's expiry.

    @happy
    Scenario: A successful redemption records who used the code and when
      Given create("task-1") has produced "ABCD2345" at "2026-01-01T00:00:00.000Z"
      And the clock is moved to "2026-01-03T09:30:00.000Z"
      When redeem("abcd-2345", "alice") is called
      Then it resolves to { ok: true, taskId: "task-1" }
      And hasAccess("alice", "task-1") resolves to true
      And list("task-1") resolves to:
        | code     | taskId | createdAt                | expiresAt                | state | usedBy | usedAt                   |
        | ABCD2345 | task-1 | 2026-01-01T00:00:00.000Z | 2026-01-15T00:00:00.000Z | used  | alice  | 2026-01-03T09:30:00.000Z |

    @boundary
    Scenario: A used code stays "used" after its expiry time passes
      Given "ABCD2345" for "task-1" was redeemed by "alice" on "2026-01-03T09:30:00.000Z"
      And the clock is moved to "2026-06-01T00:00:00.000Z"
      When list("task-1") is called
      Then the code's state is "used" with usedBy "alice"
      And hasAccess("alice", "task-1") resolves to true

  # ---------------------------------------------------------------------------
  Rule: A failed redemption changes nothing and reports the first reason that applies
    # Checked in this order: "unknown", "used", "revoked", "expired",
    # "already has access". "already has access" applies when the code is
    # unused and unexpired but the contributor already has access to its task
    # by any earlier redemption; that code stays unused and can still be
    # redeemed by someone else. A failed redemption makes no store write.

    @unhappy
    Scenario: A code can be used only once
      Given "ABCD2345" for "task-1" was redeemed by "alice"
      When redeem("ABCD2345", "bob") is called
      Then it resolves to { ok: false, reason: "used" }
      And hasAccess("bob", "task-1") resolves to false
      And list("task-1") still shows usedBy "alice"

    @unhappy
    Scenario: The same contributor redeeming their own used code again gets "used"
      Given "ABCD2345" for "task-1" was redeemed by "alice"
      When redeem("ABCD2345", "alice") is called
      Then it resolves to { ok: false, reason: "used" }

    @unhappy
    Scenario: A second code for a task the contributor can already access is not consumed
      Given "ABCD2345" for "task-1" was redeemed by "alice"
      And create("task-1") has produced "BBBBBBBB"
      When redeem("BBBBBBBB", "alice") is called
      Then it resolves to { ok: false, reason: "already has access" }
      And "BBBBBBBB" is listed with state "unused"
      When redeem("BBBBBBBB", "bob") is called
      Then it resolves to { ok: true, taskId: "task-1" }

    @boundary
    Scenario: Reason precedence when several reasons apply
      Given alice already has access to "task-1" through another code
      And a code "CCCCCCCC" for "task-1" in condition <condition>
      When redeem("CCCCCCCC", "alice") is called
      Then it resolves to { ok: false, reason: "<reason>" }

      Examples:
        | condition                          | reason             |
        | used by bob, and past expiresAt    | used               |
        | revoked, and past expiresAt        | revoked            |
        | unused, and past expiresAt         | expired            |
        | unused, not expired                | already has access |

    @unhappy
    Scenario: A failed redemption writes nothing to the store
      Given "ABCD2345" for "task-1" has been revoked
      And the store's "set" calls are being counted from zero
      When redeem("ABCD2345", "alice") is called
      Then it resolves to { ok: false, reason: "revoked" }
      And the store's "set" was called 0 times

  # ---------------------------------------------------------------------------
  Rule: revoke stops an unused code from being redeemed and throws for used or unknown codes
    # Revoking an unused code makes it "revoked", whether or not it has
    # expired. Revoking an already revoked code is a no-op that resolves and
    # writes nothing. Revoking a used code rejects with an Error
    # "code has been used" and leaves it used. Revoking a code that does not
    # normalize to an existing code rejects with an Error "unknown code".
    # A revoked code stays "revoked" after its expiry time.

    @happy
    Scenario: A revoked code cannot be redeemed
      Given create("task-1") has produced "ABCD2345"
      When revoke("abcd-2345") is called
      Then it resolves
      And "ABCD2345" is listed with state "revoked" and no usedBy or usedAt
      And redeem("ABCD2345", "alice") resolves to { ok: false, reason: "revoked" }

    @boundary
    Scenario: An expired, unused code can be revoked and then lists as revoked
      Given create("task-1") has produced "ABCD2345" at "2026-01-01T00:00:00.000Z"
      And the clock is moved to "2026-02-01T00:00:00.000Z"
      When revoke("ABCD2345") is called
      Then it resolves
      And "ABCD2345" is listed with state "revoked"

    @boundary
    Scenario: Revoking twice is a no-op
      Given "ABCD2345" for "task-1" has been revoked
      When revoke("ABCD2345") is called
      Then it resolves
      And "ABCD2345" is listed with state "revoked"

    @unhappy
    Scenario: A used code cannot be revoked
      Given "ABCD2345" for "task-1" was redeemed by "alice"
      When revoke("ABCD2345") is called
      Then it rejects with an Error "code has been used"
      And "ABCD2345" is listed with state "used" and usedBy "alice"
      And hasAccess("alice", "task-1") resolves to true

    @unhappy
    Scenario: An unknown code cannot be revoked
      When revoke("ZZZZ-ZZZZ") is called
      Then it rejects with an Error "unknown code"

  # ---------------------------------------------------------------------------
  Rule: Access is granted only by redemption and is reported per contributor
    # hasAccess is true only if the contributor has successfully redeemed a
    # code for that task. tasksFor lists each such task once, sorted ascending
    # by JavaScript's default string ordering (UTF-16 code units). Ids are
    # compared exactly: case-sensitive, untrimmed. Creating codes grants no one
    # access. An unknown contributor or task gives false or [].

    @happy
    Scenario: A contributor's tasks are listed once each, sorted
      Given alice has redeemed codes for "task-b", then "task-a", then "Task-c"
      When tasksFor("alice") is called
      Then it resolves to ["Task-c", "task-a", "task-b"]

    @boundary
    Scenario: Access lookups use exact ids
      Given alice has redeemed a code for "task-1"
      When hasAccess("<contributor>", "<task>") is called
      Then it resolves to <answer>

      Examples:
        | contributor | task    | answer |
        | alice       | task-1  | true   |
        | Alice       | task-1  | false  |
        | alice       | TASK-1  | false  |
        | alice       | task-2  | false  |
        | bob         | task-1  | false  |
        |             | task-1  | false  |

    @boundary
    Scenario: A contributor with no access has no tasks
      Given create("task-1") has produced "ABCD2345"
      When tasksFor("alice") is called
      Then it resolves to []

  # ---------------------------------------------------------------------------
  Rule: list shows a task's codes in creation order with their state at the current time
    # State precedence: "used", else "revoked", else "expired" (now >=
    # expiresAt), else "unused". usedBy and usedAt are present only on used
    # codes; on other codes the keys are absent, not undefined. Codes are
    # ordered by when create was called (oldest first), even when the clock
    # gives them equal createdAt values. A task with no codes gives []. Each
    # call returns new objects and new Date instances; mutating a result does
    # not affect the registry.

    @happy
    Scenario: Each state appears as listed
      Given these codes for "task-1", created in this order at "2026-01-01T00:00:00.000Z":
        | code     | what happened                                         |
        | AAAAAAAA | nothing                                               |
        | BBBBBBBB | redeemed by "alice" at "2026-01-02T00:00:00.000Z"     |
        | CCCCCCCC | revoked                                               |
      And create("task-1") has produced "DDDDDDDD" at "2026-01-10T00:00:00.000Z"
      And create("task-2") has produced "EEEEEEEE"
      And the clock is moved to "2026-01-20T00:00:00.000Z"
      When list("task-1") is called
      Then it resolves to:
        | code     | createdAt                | expiresAt                | state   | usedBy | usedAt                   |
        | AAAAAAAA | 2026-01-01T00:00:00.000Z | 2026-01-15T00:00:00.000Z | expired |        |                          |
        | BBBBBBBB | 2026-01-01T00:00:00.000Z | 2026-01-15T00:00:00.000Z | used    | alice  | 2026-01-02T00:00:00.000Z |
        | CCCCCCCC | 2026-01-01T00:00:00.000Z | 2026-01-15T00:00:00.000Z | revoked |        |                          |
        | DDDDDDDD | 2026-01-10T00:00:00.000Z | 2026-01-24T00:00:00.000Z | unused  |        |                          |

    @boundary
    Scenario: A task with no codes lists nothing
      When list("task-404") is called
      Then it resolves to []

    @boundary
    Scenario: Mutating a listed code does not change the registry
      Given create("task-1") has produced "ABCD2345" at "2026-01-01T00:00:00.000Z"
      When the result of list("task-1") has its first code's state set to "used" and its expiresAt moved to "2030-01-01"
      Then list("task-1") still shows "ABCD2345" as "unused" expiring "2026-01-15T00:00:00.000Z"

  # ---------------------------------------------------------------------------
  Rule: Invalid arguments are rejected before anything else happens
    # Methods never throw synchronously; they return rejected promises.
    # Argument checks come before any call to the clock, randomInt or store.
    #   create(taskId): taskId not a string or "" -> TypeError "taskId must be a non-empty string"
    #   redeem(code, contributorId): code not a string -> TypeError "code must be a string";
    #     contributorId not a string or "" -> TypeError "contributorId must be a non-empty string"
    #   revoke(code): code not a string -> TypeError "code must be a string"
    #   hasAccess, tasksFor, list: a non-string id -> TypeError "<name> must be a string",
    #     where <name> is the parameter name; "" is allowed and matches nothing
    # Whitespace-only ids are non-empty and accepted as-is.
    # The constructor throws a TypeError "invalid registry options" synchronously
    # if store.get, store.set, now or randomInt is not a function; it calls
    # none of them.

    @unhappy
    Scenario: Bad arguments reject with a TypeError
      When <call> is called
      Then it rejects with a TypeError "<message>"
      And the clock, randomInt and store were not called

      Examples:
        | call                      | message                                  |
        | create("")                | taskId must be a non-empty string        |
        | create(42)                | taskId must be a non-empty string        |
        | redeem(null, "alice")     | code must be a string                    |
        | redeem("ABCD2345", "")    | contributorId must be a non-empty string |
        | redeem("ABCD2345", 7)     | contributorId must be a non-empty string |
        | revoke(undefined)         | code must be a string                    |
        | hasAccess(1, "task-1")    | contributorId must be a string           |
        | hasAccess("alice", null)  | taskId must be a string                  |
        | tasksFor(undefined)       | contributorId must be a string           |
        | list(5)                   | taskId must be a string                  |

    @boundary
    Scenario: A whitespace-only task id is accepted
      When create(" ") is called
      Then it resolves to a code with taskId " "

    @unhappy
    Scenario: The constructor rejects missing collaborators
      When new InviteRegistry({ store, now, randomInt: undefined }) is called
      Then it throws a TypeError "invalid registry options"

  # ---------------------------------------------------------------------------
  Rule: All state lives in the store, and a failed store call leaves it unchanged
    # The registry keeps no state outside the store between operations, so a
    # new registry over the same store sees every code and every access
    # granted earlier. Using two registries over one store at overlapping
    # times is not supported and no behaviour is promised for it. Each
    # operation's changes become visible together or not at all: if a store
    # call rejects, the operation rejects with that same error and later
    # operations see the state as it was before it.

    @happy
    Scenario: A new registry over the same store sees earlier codes and access
      Given "ABCD2345" for "task-1" was redeemed by "alice" through the registry
      And create("task-1") has produced "BBBBBBBB" through the registry
      When a second registry is built over the same store
      Then its hasAccess("alice", "task-1") resolves to true
      And its list("task-1") shows "ABCD2345" used by "alice" and "BBBBBBBB" unused
      And its redeem("ABCD2345", "bob") resolves to { ok: false, reason: "used" }

    @unhappy
    Scenario: A store failure during redeem rejects and changes nothing
      Given create("task-1") has produced "ABCD2345"
      And the store's next "set" rejects with Error "disk full"
      When redeem("ABCD2345", "alice") is called
      Then it rejects with that same Error "disk full"
      And hasAccess("alice", "task-1") resolves to false
      And redeem("ABCD2345", "alice") then resolves to { ok: true, taskId: "task-1" }

    @unhappy
    Scenario: A store failure during create stores no code
      Given the store's next "set" rejects with Error "disk full"
      When create("task-1") is called
      Then it rejects with that same Error "disk full"
      And list("task-1") resolves to []

  # ---------------------------------------------------------------------------
  Rule: Overlapping calls on one registry run one at a time, in the order they were called
    # Every method call joins a single first-in, first-out queue per registry
    # and starts only after the previous call has settled (resolved or
    # rejected), however long the store takes. A call that fails does not
    # block the calls queued after it. The outcome is therefore the same as
    # awaiting each call before making the next.

    @concurrency
    Scenario: Two contributors racing for one code: the first call wins
      Given create("task-1") has produced "ABCD2345"
      And the store resolves later calls sooner than earlier ones
      When redeem("ABCD2345", "alice") and redeem("abcd-2345", "bob") are called in that order without awaiting
      Then alice's call resolves to { ok: true, taskId: "task-1" }
      And bob's call resolves to { ok: false, reason: "used" }
      And list("task-1") shows usedBy "alice"

    @concurrency
    Scenario: One contributor racing two codes for the same task consumes only one
      Given create("task-1") has produced "AAAAAAAA" and then "BBBBBBBB"
      When redeem("BBBBBBBB", "alice") and redeem("AAAAAAAA", "alice") are called in that order without awaiting
      Then the first resolves to { ok: true, taskId: "task-1" }
      And the second resolves to { ok: false, reason: "already has access" }
      And "AAAAAAAA" is listed as "unused" and "BBBBBBBB" as "used"

    @concurrency
    Scenario: Overlapping creates never repeat a code
      Given randomInt is queued with 0,0,0,0,0,0,0,0 then 0,0,0,0,0,0,0,0 then 5,5,5,5,5,5,5,5
      When create("task-1") and create("task-2") are called without awaiting
      Then the first resolves with code "AAAAAAAA"
      And the second resolves with code "FFFFFFFF"

    @concurrency
    Scenario: revoke and redeem overlapping: call order decides
      Given create("task-1") has produced "ABCD2345"
      When <first> and <second> are called in that order without awaiting
      Then redeem resolves to <redeem result>
      And revoke <revoke outcome>

      Examples:
        | first                       | second                      | redeem result                    | revoke outcome                              |
        | redeem("ABCD2345", "alice") | revoke("ABCD2345")          | { ok: true, taskId: "task-1" }   | rejects with Error "code has been used"     |
        | revoke("ABCD2345")          | redeem("ABCD2345", "alice") | { ok: false, reason: "revoked" } | resolves                                    |

    @concurrency
    Scenario: A query called during a pending redemption sees its result
      Given create("task-1") has produced "ABCD2345"
      When redeem("ABCD2345", "alice"), hasAccess("alice", "task-1") and list("task-1") are called in that order without awaiting
      Then hasAccess resolves to true
      And list shows "ABCD2345" as "used" by "alice"

    @concurrency
    Scenario: A failing call does not block the calls queued after it
      Given create("task-1") has produced "ABCD2345"
      When revoke("ZZZZZZZZ") and redeem("ABCD2345", "alice") are called in that order without awaiting
      Then revoke rejects with Error "unknown code"
      And redeem resolves to { ok: true, taskId: "task-1" }
```

Decided:
- Code format: 8 characters from "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", returned uppercase with no separator.
- Code generation: one `randomInt(32)` call per character, left to right; a non-integer or out-of-range result rejects with a RangeError.
- Collisions: a code is unique across all tasks and states; it is redrawn in full, up to 10 attempts, and then create rejects.
- Expiry length: exactly 1,209,600,000 ms after `createdAt`, with no calendar or DST adjustment.
- Expiry boundary: a code counts as expired from the instant `now >= expiresAt`.
- Normalization: whitespace and "-" are removed and the rest is upper-cased, with no look-alike substitution; `revoke` normalizes the same way.
- Malformed codes passed to `redeem` give reason "unknown" and never throw.
- Order of failure reasons: unknown, used, revoked, expired, already has access.
- "already has access" does not use up the code.
- Failed redemptions write nothing to the store.
- State order in `list`: used, then revoked, then expired, then unused; a used or revoked code keeps that state after it expires.
- `revoke`: an expired unused code can be revoked, revoking twice is a no-op, an unknown code rejects with "unknown code", and a used code rejects with "code has been used".
- Access is permanent once granted, comes only from redemption, and ids are matched exactly (case-sensitive, untrimmed).
- `tasksFor` returns each task once, sorted ascending by default string order.
- `list` returns codes in creation order; `usedBy`/`usedAt` keys are absent unless the code is used; results are copies.
- Argument validation: exact TypeError messages, promises reject instead of throwing synchronously, checks happen before any collaborator call, and "" is rejected only for `taskId` in `create` and `contributorId` in `redeem`.
- Constructor: throws a TypeError if any collaborator is missing, and calls none of them.
- An invalid Date from the clock causes a RangeError.
- Persistence: all state lives in the store, and a new registry over the same store sees it; two registries using one store at once is unsupported.
- Store failures: the operation rejects with the store's error and its changes are all-or-nothing.
- Overlapping calls: a single FIFO queue per registry, in call order; a failed call does not block the calls after it.
