# Duration strings

A job scheduler takes timeouts and delays as short strings such as `1h30m`
or `250ms` and stores them as whole milliseconds. `parseDuration` turns a
duration string into milliseconds and `formatDuration` turns milliseconds
back into the shortest such string. Both are pure functions over strings
and numbers; nothing is read from the clock or the environment.

```gherkin
Feature: Duration strings

  Rule: R1. A duration is one or more components, each a count and a unit
    A component is a decimal integer followed by one of the units `d`, `h`,
    `m`, `s` and `ms`, in that case. The integer has no sign, no decimal
    point and no leading zeros, except that `0` itself is allowed.
    Components follow one another with nothing between them. Leading and
    trailing whitespace is removed before parsing; any other whitespace is
    invalid. Nothing else is a duration: not the empty string, not a bare
    number, not an unknown unit, not a separator between components.

    @happy
    Scenario Outline: Components add up
      When I parse "<text>"
      Then the result is <ms>

      Examples:
        | text        | ms        |
        | 250ms       | 250       |
        | 90s         | 90000     |
        | 1h30m       | 5400000   |
        | 2d          | 172800000 |
        | 0s          | 0         |
        | 1d0h0m0s0ms | 86400000  |

    @boundary
    Scenario: Surrounding whitespace is ignored
      When I parse "  45m\n"
      Then the result is 2700000

    @unhappy
    Scenario Outline: Malformed durations are rejected
      When I parse "<text>"
      Then it throws an Error whose message contains "duration"

      Examples:
        | text   |
        |        |
        | 90     |
        | 1.5h   |
        | 05s    |
        | -3s    |
        | +3s    |
        | 1h 30m |
        | 1h,30m |
        | 3w     |
        | 3S     |
        | 3 s    |
        | ms     |

  Rule: R2. Units run from largest to smallest, each at most once
    Within a duration the units appear in the order d, h, m, s, ms, and no
    unit appears twice. A count may exceed the next unit's size: `90m` is
    valid and equals `1h30m`.

    @happy
    Scenario: A count may exceed the next unit
      When I parse "90m"
      Then the result is 5400000

    @unhappy
    Scenario Outline: Out-of-order or repeated units are rejected
      When I parse "<text>"
      Then it throws an Error whose message contains "duration"

      Examples:
        | text      |
        | 30m1h     |
        | 1h1h      |
        | 1s500ms2s |
        | 5ms1s     |

  Rule: R3. The result is a safe integer
    The result is the sum of the components in milliseconds, as a number.
    A duration whose total exceeds Number.MAX_SAFE_INTEGER
    (9007199254740991 ms) is rejected with an Error whose message contains
    "duration"; it is never clamped.

    @boundary
    Scenario: The largest safe duration parses
      When I parse "104249991d8h59m991ms"
      Then the result is 9007199254740991

    @unhappy
    Scenario: One millisecond more is rejected
      When I parse "104249991d8h59m992ms"
      Then it throws an Error whose message contains "duration"

  Rule: R4. Formatting gives the shortest string that parses back
    `formatDuration(ms)` takes a non-negative safe integer and returns the
    duration string with the largest units first and every zero component
    left out, so that parsing the result gives `ms` back. Zero is "0ms".
    Anything that is not a non-negative safe integer is rejected with an
    Error whose message contains "milliseconds".

    @happy
    Scenario Outline: Formatting
      When I format <ms>
      Then the result is "<text>"

      Examples:
        | ms       | text        |
        | 0        | 0ms         |
        | 250      | 250ms       |
        | 90000    | 1m30s       |
        | 5400000  | 1h30m       |
        | 86400000 | 1d          |
        | 90061001 | 1d1h1m1s1ms |

    @boundary
    Scenario: Formatting the largest safe integer
      When I format 9007199254740991
      Then the result is "104249991d8h59m991ms"

    @boundary
    Scenario: Formatting then parsing gives the number back
      When I format 123456789 and parse the result
      Then the result is 123456789

    @unhappy
    Scenario Outline: Values that are not non-negative safe integers are rejected
      When I format <value>
      Then it throws an Error whose message contains "milliseconds"

      Examples:
        | value            |
        | -1               |
        | 1.5              |
        | NaN              |
        | Infinity         |
        | 9007199254740992 |
```

Decided:

- Leading and trailing whitespace is trimmed; whitespace anywhere else is
  invalid.
- Units are lowercase only: `3S`, `3MS` and `3Ms` are invalid.
- Leading zeros are invalid, except the single digit `0`.
- A count may exceed the next unit's size (`90m` is valid); units must still
  appear in descending order, each at most once.
- The empty string and a bare number without a unit are invalid.
- No weeks, years or fractional components.
- A total above Number.MAX_SAFE_INTEGER is rejected at parse time, never
  clamped.
- Parse errors carry "duration" in their message; format errors carry
  "milliseconds".
- `formatDuration(0)` is `"0ms"`; every other result omits zero components.
