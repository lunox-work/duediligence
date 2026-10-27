# Byte sizes

The web app shows file and slice sizes in several places. `byteSize` in
`apps/web/src/lib/format.ts` turns a byte count into the short text a person
reads: `512 B`, `1.5 KB`, `12 MB`. It is a pure function: it does not read
the browser's locale, and its output is the same in every time zone and
language.

```gherkin
Feature: Byte sizes

  Rule: R1. Below 1024 bytes the count is shown in bytes
    The text is the count, a space, and `B`.

    @happy
    Scenario Outline: Small counts are bytes
      When I call byteSize(<bytes>)
      Then the result is "<text>"

      Examples:
        | bytes | text    |
        | 0     | 0 B     |
        | 1     | 1 B     |
        | 512   | 512 B   |
        | 1023  | 1,023 B |

  Rule: R2. Larger counts use the largest unit they reach
    The units are KB, MB, GB and TB, at 1024, 1024², 1024³ and 1024⁴
    bytes. A count is shown in the largest unit it is at least one of; TB
    is the largest unit, so a count of 1024 TB or more stays in TB. The
    text is the value, a space, and the unit.

    @happy
    Scenario Outline: Each unit starts at its power of 1024
      When I call byteSize(<bytes>)
      Then the result is "<text>"

      Examples:
        | bytes         | text   |
        | 1024          | 1.0 KB |
        | 1048576       | 1.0 MB |
        | 1073741824    | 1.0 GB |
        | 1099511627776 | 1.0 TB |
        | 5368709120    | 5.0 GB |

    @boundary
    Scenario Outline: TB is the largest unit
      When I call byteSize(<bytes>)
      Then the result is "<text>"

      Examples:
        | bytes            | text     |
        | 1125899906842624 | 1,024 TB |
        | 9007199254740991 | 8,192 TB |

  Rule: R3. Below 10 a value has one decimal; from 10 it is whole
    The value is rounded to one decimal, halves rounding up. If that is
    below 10 it is shown with exactly one decimal, `.0` included. Otherwise
    it is rounded to a whole number, halves rounding up, and shown without
    a decimal. Whole numbers of 1000 or more have a comma between
    thousands, in bytes as in any unit.

    @happy
    Scenario Outline: Small values keep a decimal, larger ones do not
      When I call byteSize(<bytes>)
      Then the result is "<text>"

      Examples:
        | bytes   | text     |
        | 1536    | 1.5 KB   |
        | 10188   | 9.9 KB   |
        | 10189   | 10 KB    |
        | 10240   | 10 KB    |
        | 1047552 | 1,023 KB |

    @boundary
    Scenario Outline: Halves round up
      When I call byteSize(<bytes>)
      Then the result is "<text>"

      Examples:
        | bytes | text   |
        | 1280  | 1.3 KB |
        | 10752 | 11 KB  |

  Rule: R4. A value that rounds to 1024 moves to the next unit
    When rounding a value gives 1024 in a unit below TB, the count is shown
    in the next unit instead, by R3.

    @boundary
    Scenario Outline: Rounding up to 1024 carries
      When I call byteSize(<bytes>)
      Then the result is "<text>"

      Examples:
        | bytes      | text     |
        | 1048063    | 1,023 KB |
        | 1048064    | 1.0 MB   |
        | 1073217536 | 1.0 GB   |

  Rule: R5. Only a whole, non-negative, safe count is a byte count
    Anything else throws a RangeError whose message contains "bytes".

    @unhappy
    Scenario Outline: Other numbers are refused
      When I call byteSize(<bytes>)
      Then it throws a RangeError whose message contains "bytes"

      Examples:
        | bytes            |
        | -1               |
        | 1.5              |
        | NaN              |
        | Infinity         |
        | 9007199254740992 |
```

Decided:

- Units are 1024-based and named KB, MB, GB, TB (not KiB), as
  `ComplexityProfile` names them today; there is no PB.
- Below 10 in a unit the value has exactly one decimal, `.0` included
  (`1.0 KB`); from 10 it is whole.
- Halves round up, at one decimal and at whole numbers.
- A value that rounds to 1024 is shown in the next unit (`1.0 MB`, never
  `1,024 KB`), except in TB.
- Whole numbers of 1000 or more get a comma between thousands, bytes
  included (`1,023 B`), whatever the browser's locale.
- Negative, fractional, non-finite and unsafe integers throw a RangeError
  that says "bytes"; nothing is clamped.
