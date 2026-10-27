# Requisition list CSV export

Employers want to download their requisition list, with each requisition's
status and fill counts, as a CSV file from the employer console. Today they
can only get it through their account manager. This spec covers the CSV
builder `buildRequisitionsCsv(requisitions)` in `src/index.ts`. The download
button is a separate task. The function is synchronous and pure. It returns
the whole file as a JavaScript string. Encoding that string as UTF-8 bytes
is the caller's job.

Notation used in the scenarios:

- `<BOM>` is the single character U+FEFF (`"﻿"`).
- In doc strings that show CSV output, each line stands for one row, and
  each row ends with exactly `"\r\n"`, including the last row. No other line
  terminator appears anywhere in the output, except inside a quoted field
  (see "Field quoting").
- Where a field contains characters that are hard to show (quotes, CR, LF,
  tab), the scenario gives it as a JavaScript string literal.
- In requisition tables, `<absent>` means the property is not present,
  `<null>` means it is `null`, and `<invalid>` for `createdAt` means
  `new Date(NaN)`. Any other `createdAt` cell is an ISO 8601 instant that is
  passed as `new Date(cell)`.

```gherkin
Feature: Build the requisitions CSV with buildRequisitionsCsv

  Background:
    Given the header row is exactly "Requisition ID,Title,Status,Openings,Filled,Created"
    And the valid RequisitionStatus values are "open", "on_hold", "filled" and "cancelled"

  Rule: The output is a BOM, the header row, then one row per requisition, every row ending with "\r\n"

    @happy
    Scenario: A single requisition produces a BOM, the header and one data row
      Given the requisitions
        | id    | title           | status | openings | filled | createdAt                |
        | req-1 | Warehouse Picker | open   | 5        | 2      | 2026-03-01T09:30:00.000Z |
      When buildRequisitionsCsv is called with them
      Then it returns exactly
        """
        <BOM>Requisition ID,Title,Status,Openings,Filled,Created
        req-1,Warehouse Picker,open,5,2,2026-03-01T09:30:00.000Z
        """
      And the returned string is "﻿Requisition ID,Title,Status,Openings,Filled,Created\r\nreq-1,Warehouse Picker,open,5,2,2026-03-01T09:30:00.000Z\r\n"

    @boundary
    Scenario: An empty list produces only the BOM and the header row
      Given the requisitions list is empty
      When buildRequisitionsCsv is called with it
      Then it returns exactly "﻿Requisition ID,Title,Status,Openings,Filled,Created\r\n"

    @happy
    Scenario: The BOM appears once, as the first character, and nowhere else
      Given the requisitions
        | id    | title  | status | openings | filled | createdAt                |
        | req-1 | Driver | open   | 1        | 0      | 2026-03-01T00:00:00.000Z |
        | req-2 | Cook   | open   | 1        | 0      | 2026-03-02T00:00:00.000Z |
      When buildRequisitionsCsv is called with them
      Then the first character of the result is "﻿"
      And "﻿" occurs exactly once in the result
      And the result contains exactly 3 occurrences of "\r\n"
      And the result ends with "\r\n"

  Rule: Each field is written in a fixed format

    @happy
    Scenario Outline: Field formats
      Given a requisition with id "req-1", title "Cook", status "<status>", openings <openings>, filled <filled> and createdAt <createdAt>
      When buildRequisitionsCsv is called with it
      Then its data row is "<row>"

      Examples:
        | status    | openings | filled | createdAt                     | row                                                 |
        | open      | 5        | 2      | 2026-03-01T09:30:00.000Z      | req-1,Cook,open,5,2,2026-03-01T09:30:00.000Z        |
        | on_hold   | 3        | 0      | 2026-03-01T09:30:00.000Z      | req-1,Cook,on_hold,3,0,2026-03-01T09:30:00.000Z     |
        | filled    | 4        | 4      | 2026-03-01T09:30:00.000Z      | req-1,Cook,filled,4,4,2026-03-01T09:30:00.000Z      |
        | cancelled | 0        | 0      | 2026-03-01T09:30:00.000Z      | req-1,Cook,cancelled,0,0,2026-03-01T09:30:00.000Z   |
        | open      | 1200     | 1000   | 2026-03-01T09:30:00.000Z      | req-1,Cook,open,1200,1000,2026-03-01T09:30:00.000Z  |
        | open      | 1        | 0      | 2026-03-01T11:30:00.000+02:00 | req-1,Cook,open,1,0,2026-03-01T09:30:00.000Z        |
        | open      | 1        | 0      | 2026-03-01T09:30:00.123Z      | req-1,Cook,open,1,0,2026-03-01T09:30:00.123Z        |

    # Status is written as its RequisitionStatus value, unchanged (no label, no case change).
    # Openings and Filled are plain base-10 digits: no sign, no thousands separator, no decimal point, no exponent.
    # Created is createdAt.toISOString(): UTC, millisecond precision, "Z" suffix.

    @boundary
    Scenario: Negative zero is accepted and written as 0
      Given a requisition with id "req-1", title "Cook", status "open", openings -0, filled -0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is "req-1,Cook,open,0,0,2026-03-01T00:00:00.000Z"

    @boundary
    Scenario: The largest safe integer is accepted and written in full
      Given a requisition with id "req-1", title "Cook", status "open", openings 9007199254740991, filled 9007199254740991 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is "req-1,Cook,open,9007199254740991,9007199254740991,2026-03-01T00:00:00.000Z"

    @boundary
    Scenario Outline: A missing title is an empty field
      Given a requisition with id "req-1", title <title>, status "open", openings 1, filled 0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is "req-1,,open,1,0,2026-03-01T00:00:00.000Z"

      Examples:
        | title    |
        | <absent> |
        | <null>   |
        | ""       |

    @boundary
    Scenario: Text is written as given, without trimming or normalising
      Given a requisition with id " req 1 " and title "  Café  Läufer 🚚  ", status "open", openings 1, filled 0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is " req 1 ,  Café  Läufer 🚚  ,open,1,0,2026-03-01T00:00:00.000Z"

    @boundary
    Scenario: An empty id is written as an empty field
      Given a requisition with id "", title "Cook", status "open", openings 1, filled 0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is ",Cook,open,1,0,2026-03-01T00:00:00.000Z"

  Rule: A field is quoted (RFC 4180) only when it contains a comma, a double quote, a CR or an LF

    # A quoted field is wrapped in double quotes, and each double quote inside it is doubled.
    # Fields that contain none of those four characters are never quoted, including empty
    # fields and fields with leading or trailing spaces. CR and LF inside a quoted field are
    # kept exactly as given; they are not converted to "\r\n". Quoting applies to every
    # field, but only id and title can contain these characters.

    @happy
    Scenario Outline: Quoting the title
      Given a requisition with id "req-1", title <title>, status "open", openings 1, filled 0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is <row>

      Examples:
        | title                     | row                                                                  |
        | "Picker, night shift"     | "req-1,\"Picker, night shift\",open,1,0,2026-03-01T00:00:00.000Z"     |
        | "The \"Big\" Role"        | "req-1,\"The \"\"Big\"\" Role\",open,1,0,2026-03-01T00:00:00.000Z"    |
        | "Line one\nLine two"      | "req-1,\"Line one\nLine two\",open,1,0,2026-03-01T00:00:00.000Z"      |
        | "Line one\r\nLine two"    | "req-1,\"Line one\r\nLine two\",open,1,0,2026-03-01T00:00:00.000Z"    |
        | "Ends with CR\r"          | "req-1,\"Ends with CR\r\",open,1,0,2026-03-01T00:00:00.000Z"          |
        | "\""                      | "req-1,\"\"\"\",open,1,0,2026-03-01T00:00:00.000Z"                    |
        | "Senior; Cook's mate"     | "req-1,Senior; Cook's mate,open,1,0,2026-03-01T00:00:00.000Z"         |

    @happy
    Scenario: Quoting the id
      Given a requisition with id "req,1", title "Cook", status "open", openings 1, filled 0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is "\"req,1\",Cook,open,1,0,2026-03-01T00:00:00.000Z"

  Rule: Id and title that start with a formula character are prefixed with a single quote

    # To stop spreadsheet formula injection, an id or title whose first character is
    # "=", "+", "-", "@", a tab ("\t") or a CR ("\r") gets a "'" put in front of it.
    # The prefix is added before quoting, so the quoting rule then applies to the
    # prefixed value. Only the first character is checked; a formula character after
    # a leading space is not prefixed. Status, Openings, Filled and Created are never
    # prefixed.

    @unhappy
    Scenario Outline: Neutralising formula-like titles
      Given a requisition with id "req-1", title <title>, status "open", openings 1, filled 0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is <row>

      Examples:
        | title                  | row                                                                |
        | "=SUM(A1:A9)"          | "req-1,'=SUM(A1:A9),open,1,0,2026-03-01T00:00:00.000Z"              |
        | "+44 hires"            | "req-1,'+44 hires,open,1,0,2026-03-01T00:00:00.000Z"                |
        | "-Cook"                | "req-1,'-Cook,open,1,0,2026-03-01T00:00:00.000Z"                    |
        | "@cmd"                 | "req-1,'@cmd,open,1,0,2026-03-01T00:00:00.000Z"                     |
        | "\tCook"               | "req-1,'\tCook,open,1,0,2026-03-01T00:00:00.000Z"                   |
        | "\rCook"               | "req-1,\"'\rCook\",open,1,0,2026-03-01T00:00:00.000Z"               |
        | "=HYPERLINK(\"x\",1)"  | "req-1,\"'=HYPERLINK(\"\"x\"\",1)\",open,1,0,2026-03-01T00:00:00.000Z" |
        | " =1+1"                | "req-1, =1+1,open,1,0,2026-03-01T00:00:00.000Z"                     |
        | "Cook = Chef"          | "req-1,Cook = Chef,open,1,0,2026-03-01T00:00:00.000Z"               |
        | "'quoted"              | "req-1,'quoted,open,1,0,2026-03-01T00:00:00.000Z"                   |

    @unhappy
    Scenario: Neutralising a formula-like id
      Given a requisition with id "=1+1", title "Cook", status "open", openings 1, filled 0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is "'=1+1,Cook,open,1,0,2026-03-01T00:00:00.000Z"

  Rule: Rows are ordered by creation time, oldest first, then by id

    # Ties on createdAt (same getTime()) are broken by id, compared by UTF-16 code
    # units (plain JavaScript "<" on strings, not locale-aware). Rows with the same
    # createdAt and the same id keep their input order. Input order does not matter
    # otherwise. Duplicate ids are allowed.

    @happy
    Scenario: Rows are sorted by createdAt ascending regardless of input order
      Given the requisitions
        | id    | title | status    | openings | filled | createdAt                |
        | req-c | C     | open      | 1        | 0      | 2026-03-03T00:00:00.000Z |
        | req-a | A     | filled    | 1        | 1      | 2026-03-01T00:00:00.000Z |
        | req-b | B     | on_hold   | 1        | 0      | 2026-03-02T00:00:00.000Z |
      When buildRequisitionsCsv is called with them
      Then it returns exactly
        """
        <BOM>Requisition ID,Title,Status,Openings,Filled,Created
        req-a,A,filled,1,1,2026-03-01T00:00:00.000Z
        req-b,B,on_hold,1,0,2026-03-02T00:00:00.000Z
        req-c,C,open,1,0,2026-03-03T00:00:00.000Z
        """

    @boundary
    Scenario: Equal creation times are ordered by id in code-unit order
      Given the requisitions
        | id     | title | status | openings | filled | createdAt                |
        | req-2  | T2    | open   | 1        | 0      | 2026-03-01T00:00:00.000Z |
        | b      | Tb    | open   | 1        | 0      | 2026-03-01T00:00:00.000Z |
        | req-10 | T10   | open   | 1        | 0      | 2026-03-01T00:00:00.000Z |
        | B      | TB    | open   | 1        | 0      | 2026-03-01T00:00:00.000Z |
      When buildRequisitionsCsv is called with them
      Then the data rows' ids are, in order, "B", "b", "req-10", "req-2"

    @boundary
    Scenario: The same instant written with different offsets counts as equal
      Given the requisitions
        | id    | title | status | openings | filled | createdAt                     |
        | req-b | B     | open   | 1        | 0      | 2026-03-01T11:00:00.000+02:00 |
        | req-a | A     | open   | 1        | 0      | 2026-03-01T09:00:00.000Z      |
      When buildRequisitionsCsv is called with them
      Then the data rows' ids are, in order, "req-a", "req-b"
      And both rows end with ",2026-03-01T09:00:00.000Z"

    @boundary
    Scenario: One millisecond apart is ordered by time, not by id
      Given the requisitions
        | id    | title | status | openings | filled | createdAt                |
        | req-a | A     | open   | 1        | 0      | 2026-03-01T00:00:00.001Z |
        | req-z | Z     | open   | 1        | 0      | 2026-03-01T00:00:00.000Z |
      When buildRequisitionsCsv is called with them
      Then the data rows' ids are, in order, "req-z", "req-a"

    @boundary
    Scenario: Duplicate ids with equal creation times keep input order
      Given the requisitions
        | id    | title  | status | openings | filled | createdAt                |
        | req-1 | First  | open   | 1        | 0      | 2026-03-01T00:00:00.000Z |
        | req-1 | Second | open   | 2        | 0      | 2026-03-01T00:00:00.000Z |
      When buildRequisitionsCsv is called with them
      Then the data rows' titles are, in order, "First", "Second"

  Rule: The input is not modified and the result depends only on the input

    @happy
    Scenario: The input array and its requisitions are left unchanged
      Given the requisitions
        | id    | title | status | openings | filled | createdAt                |
        | req-b | B     | open   | 1        | 0      | 2026-03-02T00:00:00.000Z |
        | req-a | A     | open   | 1        | 0      | 2026-03-01T00:00:00.000Z |
      When buildRequisitionsCsv is called with them
      Then the array still holds "req-b" then "req-a"
      And no requisition's properties have changed
      And calling buildRequisitionsCsv again with the same array returns an identical string

  Rule: A requisition with an unknown status is rejected

    # The status must equal one of the four RequisitionStatus values exactly (case-sensitive,
    # no surrounding whitespace). Anything else, including non-strings, throws an Error with
    # the message: Requisition <id>: unknown status "<String(status)>"
    # where <id> is the id exactly as given (no quoting or prefixing). No CSV is returned.

    @unhappy
    Scenario Outline: Unknown statuses throw
      Given a requisition with id "req-7", title "Cook", status <status>, openings 1, filled 0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then it throws an Error with message <message>

      Examples:
        | status     | message                                        |
        | "closed"   | "Requisition req-7: unknown status \"closed\"" |
        | "Open"     | "Requisition req-7: unknown status \"Open\""   |
        | "on-hold"  | "Requisition req-7: unknown status \"on-hold\"" |
        | " open"    | "Requisition req-7: unknown status \" open\""  |
        | ""         | "Requisition req-7: unknown status \"\""       |
        | undefined  | "Requisition req-7: unknown status \"undefined\"" |
        | null       | "Requisition req-7: unknown status \"null\""   |

  Rule: Openings and filled must be whole numbers of at least 0

    # A valid count is a value of type number for which Number.isSafeInteger(value) is true
    # and value >= 0 (so -0 is valid). Anything else throws an Error with the message
    #   Requisition <id>: openings must be a whole number of at least 0
    # or
    #   Requisition <id>: filled must be a whole number of at least 0

    @unhappy
    Scenario Outline: Invalid openings throw
      Given a requisition with id "req-7", title "Cook", status "open", openings <openings>, filled 0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then it throws an Error with message "Requisition req-7: openings must be a whole number of at least 0"

      Examples:
        | openings         |
        | -1               |
        | 1.5              |
        | 0.1              |
        | NaN              |
        | Infinity         |
        | -Infinity        |
        | 9007199254740992 |
        | "3"              |
        | null             |
        | undefined        |

    @unhappy
    Scenario Outline: Invalid filled throws
      Given a requisition with id "req-7", title "Cook", status "open", openings 5, filled <filled> and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then it throws an Error with message "Requisition req-7: filled must be a whole number of at least 0"

      Examples:
        | filled    |
        | -1        |
        | 2.5       |
        | NaN       |
        | Infinity  |
        | "2"       |
        | null      |
        | undefined |

    @boundary
    Scenario: Zero openings and zero filled are valid
      Given a requisition with id "req-1", title "Cook", status "cancelled", openings 0, filled 0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is "req-1,Cook,cancelled,0,0,2026-03-01T00:00:00.000Z"

  Rule: Filled must not be greater than openings

    # Error message: Requisition <id>: filled (<filled>) is greater than openings (<openings>)
    # with both numbers in plain decimal. Filled equal to openings is valid, for any status.

    @unhappy
    Scenario: Filled greater than openings throws
      Given a requisition with id "req-7", title "Cook", status "open", openings 3, filled 4 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then it throws an Error with message "Requisition req-7: filled (4) is greater than openings (3)"

    @unhappy
    Scenario: Any filled count with zero openings throws
      Given a requisition with id "req-7", title "Cook", status "cancelled", openings 0, filled 1 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then it throws an Error with message "Requisition req-7: filled (1) is greater than openings (0)"

    @boundary
    Scenario: Filled equal to openings is valid
      Given a requisition with id "req-1", title "Cook", status "open", openings 3, filled 3 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is "req-1,Cook,open,3,3,2026-03-01T00:00:00.000Z"

    # Status and counts are not cross-checked: "filled" with filled < openings and
    # "open" with filled = openings are both accepted as given.
    @boundary
    Scenario: Status is not checked against the counts
      Given the requisitions
        | id    | title | status | openings | filled | createdAt                |
        | req-1 | A     | filled | 3        | 1      | 2026-03-01T00:00:00.000Z |
        | req-2 | B     | open   | 2        | 2      | 2026-03-02T00:00:00.000Z |
      When buildRequisitionsCsv is called with them
      Then it returns exactly
        """
        <BOM>Requisition ID,Title,Status,Openings,Filled,Created
        req-1,A,filled,3,1,2026-03-01T00:00:00.000Z
        req-2,B,open,2,2,2026-03-02T00:00:00.000Z
        """

  Rule: The creation time must be a valid Date

    # createdAt must be a Date instance whose getTime() is not NaN. Anything else
    # (an invalid Date, a string, a number, null, undefined) throws an Error with the
    # message: Requisition <id>: invalid creation time

    @unhappy
    Scenario Outline: Invalid creation times throw
      Given a requisition with id "req-7", title "Cook", status "open", openings 1, filled 0 and createdAt <createdAt>
      When buildRequisitionsCsv is called with it
      Then it throws an Error with message "Requisition req-7: invalid creation time"

      Examples:
        | createdAt                    |
        | new Date(NaN)                |
        | new Date("not a date")       |
        | "2026-03-01T00:00:00.000Z"   |
        | 1772323200000                |
        | null                         |
        | undefined                    |

    @boundary
    Scenario: The Unix epoch is a valid creation time
      Given a requisition with id "req-1", title "Cook", status "open", openings 1, filled 0 and createdAt 1970-01-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then its data row is "req-1,Cook,open,1,0,1970-01-01T00:00:00.000Z"

  Rule: Validation stops at the first problem, checking requisitions in input order

    # Requisitions are validated in the order they appear in the input array, before
    # any sorting. For each requisition the checks run in this order: status, openings,
    # filled, filled greater than openings, creation time. The first failing check throws;
    # nothing is returned and no later check runs.

    @unhappy
    Scenario: The first invalid requisition in input order is reported, not the first in creation order
      Given the requisitions
        | id    | title | status | openings | filled | createdAt                |
        | req-1 | A     | open   | 1        | 0      | 2026-03-05T00:00:00.000Z |
        | req-2 | B     | closed | 1        | 0      | 2026-03-04T00:00:00.000Z |
        | req-3 | C     | open   | -1       | 0      | 2026-03-01T00:00:00.000Z |
      When buildRequisitionsCsv is called with them
      Then it throws an Error with message "Requisition req-2: unknown status \"closed\""

    @unhappy
    Scenario Outline: Within one requisition, checks run in a fixed order
      Given a requisition with id "req-7", title "Cook", status <status>, openings <openings>, filled <filled> and createdAt <createdAt>
      When buildRequisitionsCsv is called with it
      Then it throws an Error with message <message>

      Examples:
        | status   | openings | filled | createdAt                | message                                                              |
        | "closed" | -1       | 9      | <invalid>                | "Requisition req-7: unknown status \"closed\""                       |
        | "open"   | -1       | 1.5    | <invalid>                | "Requisition req-7: openings must be a whole number of at least 0"   |
        | "open"   | 2        | 1.5    | <invalid>                | "Requisition req-7: filled must be a whole number of at least 0"     |
        | "open"   | 2        | 3      | <invalid>                | "Requisition req-7: filled (3) is greater than openings (2)"         |
        | "open"   | 2        | 2      | <invalid>                | "Requisition req-7: invalid creation time"                           |

    @unhappy
    Scenario: The error names the id exactly as given, without CSV quoting or prefixing
      Given a requisition with id "=req, \"7\"", title "Cook", status "closed", openings 1, filled 0 and createdAt 2026-03-01T00:00:00.000Z
      When buildRequisitionsCsv is called with it
      Then it throws an Error with message "Requisition =req, \"7\": unknown status \"closed\""
```

Decided:
- Status column: written as the raw `RequisitionStatus` value (`on_hold`), not as a human-readable label.
- Created column format: `createdAt.toISOString()`, i.e. UTC with milliseconds and a `Z` suffix.
- Openings/Filled format: plain base-10 digits; `-0` is accepted and written as `0`.
- Upper limit for counts: must be safe integers (≤ 9007199254740991); larger values are rejected as not whole numbers.
- Non-number counts (e.g. `"3"`, `null`) are rejected, with no coercion.
- Quoting: RFC 4180, with a field quoted only when it contains `,`, `"`, CR or LF; embedded quotes are doubled; embedded line breaks are kept as given.
- Formula injection: an id or title that starts with `=`, `+`, `-`, `@`, tab or CR gets a `'` prefix, added before quoting.
- Text is not trimmed, normalised or validated; an empty id or title gives an empty field.
- A missing title (absent, `null` or `""`) is an empty, unquoted field.
- Empty input: returns the BOM and the header row, with its trailing `"\r\n"`.
- Trailing line terminator: every row, including the last, ends with `"\r\n"`.
- BOM: the output is a string that starts with a single U+FEFF; encoding it as UTF-8 bytes is the caller's job.
- Sort order: `createdAt` ascending by instant, then id by UTF-16 code-unit order (not locale-aware); full ties keep input order.
- Duplicate ids are allowed, not rejected.
- Status is not cross-checked against the counts (e.g. `filled` with spare openings is accepted).
- Status matching is exact and case-sensitive, with no trimming.
- `createdAt` must be a valid `Date` instance; strings and numbers are rejected.
- Error type and messages: a plain `Error` with an exact message per failure, using the raw id.
- With several invalid requisitions, the first one in input order (before sorting) is reported.
- Within one requisition, checks run in a fixed order: status, openings, filled, filled > openings, creation time.
- No partial output: any invalid requisition makes the whole call throw.
- The input array and its requisitions are not modified, and the function is pure.
- Overlapping calls: the function is synchronous and pure, so calls cannot overlap and no `@concurrency` scenarios are needed.
