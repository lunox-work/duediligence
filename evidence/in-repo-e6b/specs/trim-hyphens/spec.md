# Trim leading and trailing hyphens from generated handles in linear time

`UserProfileStore.suggest(email)` in `packages/db/src/emails.ts` builds a
handle stem with the private helper `toHandleBase(email)`. The helper takes
the part before the first `@`, lowercases it, turns each run of characters
outside `[a-z0-9_-]` into one `-`, strips leading and trailing hyphens,
truncates to `USERNAME_MAX_LENGTH`, and adds `-user` to a stem shorter than
`USERNAME_MIN_LENGTH`. Today the hyphen strip uses
`replace(/^-+|-+$/g, "")`. CodeQL flagged this as a polynomial ReDoS: if a
long run of hyphens is followed by any other character, `-+$` is retried
from every offset in the run, so the cost is quadratic in the run's length.
The local part comes from a provider and has no length limit, and the strip
runs before truncation.

The change replaces only that strip with index arithmetic. Walk a start
index forward past leading `-` and an end index backward past trailing `-`,
then take `slice(start, end)`. No regular expression is used for the strip.
For every input string, `toHandleBase` must return exactly what it returns
today. Each step before and after the strip stays as it is: split on `@`,
`toLowerCase()`, `replace(/[^a-z0-9_-]+/g, "-")`,
`slice(0, USERNAME_MAX_LENGTH)` and the `-user` padding.

## Interface

The change adds, removes and renames no exports, and no signature changes.
`packages/db/src/emails.ts` keeps exporting the following:

- `createProfileStore(db: Database): UserProfileStore`. `suggest` produces
  the same output as before for every input (see the rules below). `get` and
  `setUsername` are unchanged.
- `createEmailStore(db: Database): EmailStore`. Unchanged.
- `const USERNAME_MIN_LENGTH = 3` and `const USERNAME_MAX_LENGTH = 30`.
  Unchanged.
- `interface ProvenEmail`, `interface EmailStore`, `type UsernameResult` and
  `interface UserProfileStore`. Unchanged.

`toHandleBase(email: string): string` stays private to the module and is not
exported. Tests reach it through `createProfileStore(db).suggest(email)`.
`db` is the in-memory fake `createFakeEmailDb` from
`packages/db/test/fake-email-db.ts`. With no user holding the stem,
`suggest` returns the stem unchanged.

```gherkin
Feature: Hyphen trimming in generated handles

  Background:
    Given a profile store created with createProfileStore over createFakeEmailDb() seeded with no users

  Rule: Leading and trailing hyphens are stripped from the stem after character replacement, and hyphens inside it are kept

    @happy
    Scenario Outline: Hyphens at either end are removed
      When suggest is called with "<email>"
      Then it resolves to "<handle>"

      Examples:
        | email                     | handle |
        | dana@example.test         | dana   |
        | -dana@example.test        | dana   |
        | dana-@example.test        | dana   |
        | ---dana---@example.test   | dana   |
        | -Dana-@example.test       | dana   |
        | -abc@example.test         | abc    |

    @happy
    Scenario Outline: Characters replaced by a hyphen at either end are removed with it
      When suggest is called with "<email>"
      Then it resolves to "<handle>"

      Examples:
        | email                     | handle |
        | .dana.@example.test       | dana   |
        | +-dana-+@example.test     | dana   |

    @boundary
    Scenario: A leading space becomes a hyphen and is trimmed
      When suggest is called with " dana@example.test", which starts with one space
      Then it resolves to "dana"

    @boundary
    Scenario Outline: Interior hyphens are neither removed nor collapsed
      When suggest is called with "<email>"
      Then it resolves to "<handle>"

      Examples:
        | email                     | handle |
        | a--b@example.test         | a--b   |
        | a-.-b@example.test        | a---b  |

    @boundary
    Scenario Outline: Underscores are not trimmed, only hyphens
      When suggest is called with "<email>"
      Then it resolves to "<handle>"

      Examples:
        | email                     | handle  |
        | _dana_@example.test       | _dana_  |
        | -_-@example.test          | _-user  |

  Rule: A stem that is shorter than USERNAME_MIN_LENGTH after trimming gets "-user" appended, including the empty stem

    @boundary
    Scenario Outline: An all-hyphen or empty local part trims to empty and becomes "-user"
      When suggest is called with "<email>"
      Then it resolves to "-user"

      Examples:
        | email              |
        | -@example.test     |
        | ---@example.test   |
        | ...@example.test   |
        | @example.test      |
        |                    |

    @boundary
    Scenario Outline: A stem shortened by trimming is padded
      When suggest is called with "<email>"
      Then it resolves to "<handle>"

      Examples:
        | email                | handle   |
        | jo-@example.test     | jo-user  |
        | -jo@example.test     | jo-user  |
        | --a--@example.test   | a-user   |
        | ab-@example.test     | ab-user  |

  Rule: Only the text before the first "@" is used, and input without "@" is used whole

    @boundary
    Scenario Outline: Local part extraction is unchanged
      When suggest is called with "<email>"
      Then it resolves to "<handle>"

      Examples:
        | email        | handle |
        | dana         | dana   |
        | -dana-       | dana   |
        | a@b@c.test   | a-user |

  Rule: Trimming happens before truncation to USERNAME_MAX_LENGTH, and the truncated stem is not trimmed again

    @boundary
    Scenario: Leading hyphens do not use up the length budget
      When suggest is called with 5 "-" followed by 30 "x" and "@example.test"
      Then it resolves to 30 "x"

    @boundary
    Scenario: Trailing hyphens past the limit are dropped
      When suggest is called with 30 "x" followed by 5 "-" and "@example.test"
      Then it resolves to 30 "x"

    @boundary
    Scenario: Truncation can leave a trailing hyphen
      When suggest is called with 29 "x" followed by "-y@example.test"
      Then it resolves to 29 "x" followed by "-"
      And its length is 30

  Rule: Trimming time grows linearly with the length of the local part, so long hyphen runs give the same result as short ones

    @unhappy
    Scenario: A long interior hyphen run, the input the regex was quadratic on
      When suggest is called with "a", 100000 "-", "b" and "@example.test"
      Then it resolves to "a" followed by 29 "-"
      And its length is 30

    @unhappy
    Scenario: A long hyphen run on both sides of the name
      When suggest is called with 100000 "-", "dana", 100000 "-" and "@example.test"
      Then it resolves to "dana"

    @unhappy
    Scenario: A long all-hyphen local part
      When suggest is called with 100000 "-" followed by "@example.test"
      Then it resolves to "-user"

  Rule: Collision handling in suggest is unchanged and works on the trimmed stem

    @happy
    Scenario: The counter is appended to the trimmed stem
      Given the fake is seeded with a user "user_2" whose username is "dana"
      When suggest is called with "--dana--@example.test"
      Then it resolves to "dana2"

    @happy
    Scenario: The random fallback uses the trimmed stem
      Given the fake is seeded with users holding the usernames "dana" and "dana2" through "dana20"
      When suggest is called with "-dana-@example.test"
      Then it resolves to a value matching /^dana-[0-9a-f]{6}$/

  Rule: The trim is a pure function of its input, with no state kept between calls

    @concurrency
    Scenario: Overlapping suggest calls each get their own result
      When suggest is called with "-dana-@example.test", "a--b@example.test" and "---@example.test" in parallel with Promise.all
      Then they resolve to "dana", "a--b" and "-user", in that order

    @boundary
    Scenario: Repeating a call gives the same result
      When suggest is called with "-dana-@example.test" three times in a row
      Then every call resolves to "dana"
```

Decided:

- The output stays exactly the same as the regex version for every input, including the `-user` padding of an empty stem.
  Ticket: "Verified identical to the regex across the edge cases and several thousand fuzzed inputs, including the all-hyphen string that trims to empty."
  Instead: treat the fix as a chance to change the empty-stem result to `user` with no leading hyphen.
- Trimming still happens before truncation, and the truncated stem is not trimmed again, so a handle can end in `-`.
  Ticket: "the truncation to USERNAME_MAX_LENGTH happens after the trim rather than before, so it does not cap the work either."
  Instead: trim again after truncation, or truncate the local part before trimming to cap the work.
- Only `-` is trimmed. `_` at either end is kept.
  Ticket: silent.
  Instead: trim every non-alphanumeric character from the ends.
- Interior runs of hyphens are kept as they are and not collapsed to one.
  Ticket: silent.
  Instead: collapse consecutive hyphens into one while trimming.
- `toHandleBase` stays private. Tests reach it through `createProfileStore(createFakeEmailDb().db).suggest`.
  Ticket: "The change keeps the exports' names and signatures."
  Instead: export `toHandleBase`, or move it to its own module, so it can be tested directly.
- The linear-time requirement is pinned by checking the output on 100,000-hyphen inputs, not by a timing assertion.
  Ticket: "On a local part that is a long run of hyphens, the `-+$` alternative retries from every offset before failing, which is quadratic in the length of the run."
  Instead: assert a wall-clock limit, for example under 50 ms, on the long-run input.
- The regression input is 100,000 hyphens between two letters, the shape on which `-+$` fails at every offset.
  Ticket: "On a local part that is a long run of hyphens"
  Instead: an all-hyphen string, which the regex matches in one pass and so does not exercise the quadratic path.
- The trim keeps no state between calls (no shared `/g` or `/y` regex with `lastIndex`), so overlapping and repeated calls are independent.
  Ticket: silent.
  Instead: leave call-to-call state unspecified because the helper is synchronous.
- Lowercasing, replacing characters outside `[a-z0-9_-]`, splitting on the first `@`, and the counter and random-suffix collision handling all stay as they are.
  Ticket: silent.
  Instead: rewrite the character replacement without a regex as well.
