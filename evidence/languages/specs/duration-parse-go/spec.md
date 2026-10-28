# Duration strings

A job scheduler takes timeouts and delays as short strings such as `1h30m`
or `250ms` and stores them as whole milliseconds. `ParseDuration` turns a
duration string into milliseconds and `FormatDuration` turns milliseconds
back into the shortest such string. Both are pure functions over strings
and `int64`s; nothing is read from the clock or the environment. The
configuration is also read by a JavaScript admin UI, so no stored value may
exceed 9007199254740991 (2^53 - 1), the largest integer it reads exactly.

```gherkin
Feature: Duration strings

  Rule: R1. A duration is one or more components, each a count and a unit
    A component is a decimal integer followed by one of the units `d`, `h`,
    `m`, `s` and `ms`, in that case. The integer has no sign, no decimal
    point and no leading zeros, except that `0` itself is allowed. Only the
    ASCII digits 0-9 count as digits. Components follow one another with
    nothing between them. Leading and trailing whitespace (as
    strings.TrimSpace removes it) is removed before parsing; any other
    whitespace is invalid. Nothing else is a duration: not the empty string,
    not a bare number, not an unknown unit, not a separator between
    components. Invalid text returns 0 and a non-nil error whose Error()
    contains "duration".

    @happy
    Scenario Outline: Components add up
      When I call ParseDuration("<text>")
      Then the result is <ms> and the error is nil

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
      When I call ParseDuration("  45m\n")
      Then the result is 2700000 and the error is nil

    @unhappy
    Scenario Outline: Malformed durations are rejected
      When I call ParseDuration("<text>")
      Then the result is 0 and the error's message contains "duration"

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
        | ３s    |

  Rule: R2. Units run from largest to smallest, each at most once
    Within a duration the units appear in the order d, h, m, s, ms, and no
    unit appears twice. A count may exceed the next unit's size: `90m` is
    valid and equals `1h30m`.

    @happy
    Scenario: A count may exceed the next unit
      When I call ParseDuration("90m")
      Then the result is 5400000 and the error is nil

    @unhappy
    Scenario Outline: Out-of-order or repeated units are rejected
      When I call ParseDuration("<text>")
      Then the result is 0 and the error's message contains "duration"

      Examples:
        | text      |
        | 30m1h     |
        | 1h1h      |
        | 1s500ms2s |
        | 5ms1s     |

  Rule: R3. The result is an int64 no larger than 2^53 - 1
    The result is the sum of the components in milliseconds. A duration
    whose total exceeds 9007199254740991 ms returns 0 and an error whose
    message contains "duration"; it is never clamped, and a count too large
    for an int64 is rejected the same way, never wrapped.

    @boundary
    Scenario: The largest duration parses
      When I call ParseDuration("104249991d8h59m991ms")
      Then the result is 9007199254740991 and the error is nil

    @unhappy
    Scenario Outline: Totals above the largest are rejected
      When I call ParseDuration("<text>")
      Then the result is 0 and the error's message contains "duration"

      Examples:
        | text                    |
        | 104249991d8h59m992ms    |
        | 99999999999999999999ms  |

  Rule: R4. Formatting gives the shortest string that parses back
    `FormatDuration(ms)` takes an int64 from 0 to 9007199254740991 and
    returns the duration string with the largest units first and every zero
    component left out, so that parsing the result gives `ms` back. Zero is
    "0ms". Any other int64 returns "" and a non-nil error whose Error()
    contains "milliseconds".

    @happy
    Scenario Outline: Formatting
      When I call FormatDuration(<ms>)
      Then the result is "<text>" and the error is nil

      Examples:
        | ms       | text        |
        | 0        | 0ms         |
        | 250      | 250ms       |
        | 90000    | 1m30s       |
        | 5400000  | 1h30m       |
        | 86400000 | 1d          |
        | 90061001 | 1d1h1m1s1ms |

    @boundary
    Scenario: Formatting the largest value
      When I call FormatDuration(9007199254740991)
      Then the result is "104249991d8h59m991ms" and the error is nil

    @boundary
    Scenario: Formatting then parsing gives the number back
      When I call FormatDuration(123456789) and ParseDuration of its result
      Then the result is 123456789 and both errors are nil

    @unhappy
    Scenario Outline: Out-of-range values are rejected
      When I call FormatDuration(<value>)
      Then the result is "" and the error's message contains "milliseconds"

      Examples:
        | value                |
        | -1                   |
        | 9007199254740992     |
        | math.MinInt64        |
        | math.MaxInt64        |
```

Decided:

- Leading and trailing whitespace is trimmed; whitespace anywhere else is
  invalid.
  Ticket: silent.
  Instead: reject any whitespace, or allow spaces between components.
- Units are lowercase only: `3S`, `3MS` and `3Ms` are invalid.
  Ticket: "human-readable durations like `1h30m`, `90s` or `250ms`"
  Instead: accept units in any case.
- Leading zeros are invalid, except the single digit `0`; only ASCII digits
  count.
  Ticket: silent.
  Instead: accept `05s`, and any Unicode digit.
- A count may exceed the next unit's size (`90m` is valid); units must still
  appear in descending order, each at most once.
  Ticket: silent.
  Instead: require each count below the next unit's size, or allow any
  order.
- The empty string and a bare number without a unit are invalid.
  Ticket: "Job timeouts are raw millisecond numbers in the config and people keep getting them wrong"
  Instead: read a bare number as milliseconds, as the config does today.
- No weeks, years or fractional components.
  Ticket: silent.
  Instead: accept `w` and decimals such as `1.5h`.
- A total above 2^53 - 1 ms is rejected at parse time, never clamped, and
  an int64 overflow is rejected, never wrapped.
  Ticket: silent.
  Instead: allow anything an int64 holds, as time.Duration does.
- Failures return the zero value and an error whose message names
  "duration" (parsing) or "milliseconds" (formatting).
  Ticket: silent.
  Instead: exported sentinel errors to compare with errors.Is.
- `FormatDuration(0)` is `"0ms"`; every other result omits zero components.
  Ticket: "print them back in the same style in the admin UI instead of the raw number"
  Instead: `"0s"` for zero, as time.Duration's String does.
