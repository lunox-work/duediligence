## Notes

### File layout

- The output starts with the byte order mark U+FEFF as its first character, then the header row `Requisition ID,Title,Status,Openings,Filled,Created`, then one data row per requisition.
- Every row, the header included, ends with `\r\n`. Nothing follows the last row's `\r\n`, so there is no blank row at the end.
- With no requisitions, the output is exactly the BOM, then `Requisition ID,Title,Status,Openings,Filled,Created\r\n`.
- Rows are sorted by creation time, earliest first, whatever the input order. Example: input REQ-A (2026-03-01), REQ-C (2026-01-01), REQ-B (2026-02-01) gives rows REQ-C, REQ-B, REQ-A.
- Requisitions with the same creation time (separate but equal Date objects) are sorted by id, ascending. Example: REQ-C, REQ-A, REQ-B all at 2026-01-15T10:00:00Z give rows REQ-A, REQ-B, REQ-C.
- A row's columns are id, title, status label, openings, filled, created date. Example: `REQ-1,Engineer,Open,3,1,2026-01-15`.

### Field formats

- Status labels: `open` → `Open`, `on_hold` → `On hold`, `filled` → `Filled`, `cancelled` → `Cancelled`.
- Openings and filled are written as plain integers with no thousands separator. Examples: `12`, `0`, `1500`, `1000`.
- A `null` title and an absent (`undefined`) title are both written as an empty field, with no quotes. Example: `REQ-3,,Filled,2,2,2026-01-03`.
- The created column is the creation time's UTC calendar date as `YYYY-MM-DD`, regardless of the offset the time was given in. Examples: `2026-06-30T23:30:00.000-05:00` → `2026-07-01`; `2026-07-02T00:30:00.000+05:00` → `2026-07-01`; `2026-07-02T23:59:59.999Z` → `2026-07-02`.

### Quoting (title field)

- A title that contains a comma, a double quote, `\n` or `\r` is wrapped in double quotes, and each double quote inside it is doubled. Examples: `Sales, East` → `"Sales, East"`; `The "Best" Job` → `"The ""Best"" Job"`; `"` → `""""`; `Line\nTwo` → `"Line\nTwo"`; `Line\rTwo` → `"Line\rTwo"`.
- A title with a leading or trailing space is wrapped in double quotes. Examples: ` Driver` → `" Driver"`; `Driver ` → `"Driver "`.
- Spaces inside a title do not cause quoting. Example: `Senior Delivery Driver` is written unquoted.

### Formula protection (title field)

- A title whose first character is `=`, `+`, `-`, `@`, tab or `\r` gets a single quote `'` added in front. Examples: `=SUM(A1:A9)` → `'=SUM(A1:A9)`; `+1 Engineer` → `'+1 Engineer`; `-Manager` → `'-Manager`; `@Lead` → `'@Lead`; `\tTotal` → `'\tTotal`.
- Only the first character counts. `a=b` is written as `a=b`, and ` =1` (leading space) gets no `'` and is only quoted because of the leading space: `" =1"`.
- The `'` is added first, then the quoting rules apply to the resulting value. Examples: `\rcmd` → `"'\rcmd"`; `=HYPERLINK("x")` → `"'=HYPERLINK(""x"")"`; `=1,2` → `"'=1,2"`.

### Refusing bad data

- The call throws an `Error` whose message contains the bad requisition's id. This holds even when a valid requisition comes before it in the input, and no CSV is returned.
- Each of these is refused (example id `REQ-BAD-77`):
  - an unknown status, such as `closed`
  - a status in the wrong case, such as `Open`
  - negative openings (`-1`), fractional openings (`2.5`), or `NaN` openings
  - negative filled (`-1`) or fractional filled (`0.5`)
  - filled greater than openings, for example openings 2 with filled 3, openings 4 with filled 5, or openings 0 with filled 1
  - an invalid creation time (`new Date("not a date")`)
- Filled equal to openings is accepted (openings 4 with filled 4 → `REQ-EQ,Engineer,Open,4,4,2026-01-15`), and so are zeros (openings 0 with filled 0 → `REQ-ZERO,Engineer,Open,0,0,2026-01-15`).
