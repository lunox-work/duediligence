# Duration strings

A job scheduler takes timeouts and delays as short strings such as `1h30m`
or `250ms` and stores them as whole milliseconds. `parse_duration` turns a
duration string into milliseconds and `format_duration` turns milliseconds
back into the shortest such string. Both are pure functions over string
slices and `u64`s; nothing is read from the clock or the environment. The
configuration is also read by a JavaScript admin UI, so no stored value may
exceed 9007199254740991 (2^53 - 1), the largest integer it reads exactly.

```gherkin
Feature: Duration strings

  Rule: R1. A duration is one or more components, each a count and a unit
    A component is a decimal integer followed by one of the units `d`, `h`,
    `m`, `s` and `ms`, in that case. The integer has no sign, no decimal
    point and no leading zeros, except that `0` itself is allowed. Only the
    ASCII digits 0-9 count as digits. Components follow one another with
    nothing between them. Leading and trailing whitespace (as str::trim
    removes it) is removed before parsing; any other whitespace is invalid.
    Nothing else is a duration: not the empty string, not a bare number, not
    an unknown unit, not a separator between components. Invalid text
    returns an Err whose Display text contains "duration".

    @happy
    Scenario Outline: Components add up
      When I call parse_duration("<text>")
      Then the result is Ok(<ms>)

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
      When I call parse_duration("  45m\n")
      Then the result is Ok(2700000)

    @unhappy
    Scenario Outline: Malformed durations are rejected
      When I call parse_duration("<text>")
      Then the result is an Err whose Display text contains "duration"

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
      When I call parse_duration("90m")
      Then the result is Ok(5400000)

    @unhappy
    Scenario Outline: Out-of-order or repeated units are rejected
      When I call parse_duration("<text>")
      Then the result is an Err whose Display text contains "duration"

      Examples:
        | text      |
        | 30m1h     |
        | 1h1h      |
        | 1s500ms2s |
        | 5ms1s     |

  Rule: R3. The result is a u64 no larger than 2^53 - 1
    The result is the sum of the components in milliseconds. A duration
    whose total exceeds 9007199254740991 ms returns an Err whose Display
    text contains "duration"; it is never clamped, and a count too large
    for a u64 is rejected the same way, never a panic and never wrapped.

    @boundary
    Scenario: The largest duration parses
      When I call parse_duration("104249991d8h59m991ms")
      Then the result is Ok(9007199254740991)

    @unhappy
    Scenario Outline: Totals above the largest are rejected
      When I call parse_duration("<text>")
      Then the result is an Err whose Display text contains "duration"

      Examples:
        | text                    |
        | 104249991d8h59m992ms    |
        | 99999999999999999999ms  |

  Rule: R4. Formatting gives the shortest string that parses back
    `format_duration(ms)` takes a u64 from 0 to 9007199254740991 and returns
    Ok of the duration string with the largest units first and every zero
    component left out, so that parsing the result gives `ms` back. Zero is
    "0ms". A larger u64 returns an Err whose Display text contains
    "milliseconds".

    @happy
    Scenario Outline: Formatting
      When I call format_duration(<ms>)
      Then the result is Ok("<text>")

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
      When I call format_duration(9007199254740991)
      Then the result is Ok("104249991d8h59m991ms")

    @boundary
    Scenario: Formatting then parsing gives the number back
      When I call parse_duration on the Ok value of format_duration(123456789)
      Then the result is Ok(123456789)

    @unhappy
    Scenario Outline: Out-of-range values are rejected
      When I call format_duration(<value>)
      Then the result is an Err whose Display text contains "milliseconds"

      Examples:
        | value                |
        | 9007199254740992     |
        | u64::MAX             |
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
- A total above 2^53 - 1 ms is rejected at parse time, never clamped; a u64
  overflow is an Err, never a panic or a wrap.
  Ticket: silent.
  Instead: allow anything a u64 holds, as std::time::Duration does.
- Failures are an Err whose Display text names "duration" (parsing) or
  "milliseconds" (formatting).
  Ticket: silent.
  Instead: one error variant per failure for callers to match on.
- `format_duration(0)` is `"0ms"`; every other result omits zero components.
  Ticket: "print them back in the same style in the admin UI instead of the raw number"
  Instead: `"0s"` for zero, as Duration's Debug output does.
