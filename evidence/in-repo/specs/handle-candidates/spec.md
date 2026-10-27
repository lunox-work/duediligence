# Handle candidates

When a handle stem is taken, the profile store tries numbered variants of it
until one is free. `handleCandidates` returns that sequence, in order, as a
pure function in `packages/core/src/handle.ts`: it reads nothing from the
store, the clock or the environment, and says nothing about which candidates
are free. Every candidate is a valid handle by `checkHandle`, at most
`HANDLE_MAX_LENGTH` (30) characters.

```gherkin
Feature: Handle candidates

  Rule: R1. The stem comes first, then numbered variants from 2 upwards
    `handleCandidates(stem, count)` returns exactly `count` handles. The
    first is the stem itself. The next ones are the stem followed by the
    numbers 2, 3, 4 and so on, in that order, with nothing between the stem
    and the number.

    @happy
    Scenario: A short stem gets plain numbered variants
      When I call handleCandidates("ada", 4)
      Then the result is ["ada", "ada2", "ada3", "ada4"]

    @happy
    Scenario: One candidate is the stem alone
      When I call handleCandidates("grace-hopper", 1)
      Then the result is ["grace-hopper"]

  Rule: R2. The stem is cut so the number always fits
    A variant longer than 30 characters keeps its whole number and loses
    characters from the end of the stem: the stem is cut to 30 minus the
    number's digit count. Nothing else is removed, so a cut that ends on a
    hyphen or an underscore keeps it.

    @boundary
    Scenario: A 30-character stem loses its last character for a one-digit number
      When I call handleCandidates("abcdefghijklmnopqrstuvwxyzabcd", 3)
      Then the result is
        | abcdefghijklmnopqrstuvwxyzabcd |
        | abcdefghijklmnopqrstuvwxyzabc2 |
        | abcdefghijklmnopqrstuvwxyzabc3 |

    @boundary
    Scenario: Two-digit numbers cut one character more
      When I call handleCandidates("abcdefghijklmnopqrstuvwxyz-abc", 10)
      Then candidate 9 is "abcdefghijklmnopqrstuvwxyz-ab9"
      And candidate 10 is "abcdefghijklmnopqrstuvwxyz-a10"

    @boundary
    Scenario: A cut that ends on a hyphen keeps it
      When I call handleCandidates("abcdefghijklmnopqrstuvwxyza-bc", 11)
      Then candidate 11 is "abcdefghijklmnopqrstuvwxyza-11"

  Rule: R3. Candidates are distinct
    A variant equal to a candidate already in the list is skipped, and the
    numbering continues, so the result still has `count` distinct handles.
    Skipped numbers are not reused.

    @boundary
    Scenario: A variant that repeats the stem is skipped
      Given the stem "abcdefghijklmnopqrstuvwxyz0123" (30 characters)
      When I call handleCandidates(stem, 3)
      Then the result is
        | abcdefghijklmnopqrstuvwxyz0123 |
        | abcdefghijklmnopqrstuvwxyz0122 |
        | abcdefghijklmnopqrstuvwxyz0124 |

  Rule: R4. The stem must already be a valid handle
    The stem is not cleaned, trimmed or lowercased: it must pass
    `checkHandle` as given. Otherwise the call throws an Error whose message
    contains "stem".

    @unhappy
    Scenario Outline: An invalid stem is refused
      When I call handleCandidates("<stem>", 3)
      Then it throws an Error whose message contains "stem"

      Examples:
        | stem                            |
        |                                 |
        | ab                              |
        | Ada                             |
        | ada lovelace                    |
        | ada!                            |
        | abcdefghijklmnopqrstuvwxyz01234 |

  Rule: R5. The count is a whole number from 1 to 100
    Otherwise the call throws a RangeError whose message contains "count".

    @unhappy
    Scenario Outline: A count out of range is refused
      When I call handleCandidates("ada", <count>)
      Then it throws a RangeError whose message contains "count"

      Examples:
        | count    |
        | 0        |
        | -1       |
        | 2.5      |
        | 101      |
        | NaN      |
        | Infinity |

    @boundary
    Scenario: The largest count is allowed
      When I call handleCandidates("ada", 100)
      Then the result has 100 entries, the last of them "ada100"
```

Decided:

- The first candidate is the stem itself; numbering starts at 2 with no
  separator (`ada2`), as `suggest` does today.
- The stem is cut to make room for the number; the number is never cut.
- A cut keeps a trailing hyphen or underscore (it is still a valid handle).
- A variant equal to an earlier candidate is skipped and numbering
  continues; skipped numbers are not reused.
- The stem must pass `checkHandle` as given; it is not cleaned or
  lowercased. Errors for the stem say "stem".
- The count must be an integer from 1 to 100; other counts throw a
  RangeError that says "count".
