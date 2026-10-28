# Download the requisition list as CSV

Employers download their requisition list as a CSV file and open it in a
spreadsheet. The console's backend sends the employer's requisitions to the
export service and streams its answer to the browser as the download. The
file must open cleanly in Excel and must not let a cell run as a formula.

```gherkin
Feature: Serve the requisitions CSV

  Background:
    Given the service answers "POST /requisitions.csv", whose body is JSON: an array of requisitions
    And a requisition is an object with "id" (a string), "title" (a string, or null or absent when missing), "status", "openings", "filled" and "createdAt"
    And the status is one of "open", "on_hold", "filled" or "cancelled"
    And "createdAt" is a time written "YYYY-MM-DDTHH:MM:SSZ", with optional fractional seconds after the seconds and an offset "+HH:MM" or "-HH:MM" in place of "Z"
    And a successful answer is status 200 with the headers "Content-Type: text/csv; charset=utf-8" and "Content-Disposition: attachment; filename=\"requisitions.csv\"", and the CSV as its body

  Rule: The file has a fixed layout

    @happy
    Scenario: The header and one row per requisition
      When the CSV is requested
      Then the body starts with a UTF-8 byte order mark, the bytes EF BB BF
      And its first row is "Requisition ID,Title,Status,Openings,Filled,Created"
      And each requisition is one row after it, in order of creation time, then of id compared as strings
      And every row, the last included, ends with "\r\n"

    @happy
    Scenario: Values are written for people to read
      When the CSV is requested
      Then the status is written "Open", "On hold", "Filled" or "Cancelled"
      And the creation time is written as its UTC date, "YYYY-MM-DD": "2026-03-01T01:30:00+02:00" is written "2026-02-28"
      And numbers are written as plain digits
      And a missing title is an empty field

    @boundary
    Scenario: No requisitions
      When the CSV is requested for an empty array
      Then the body is the byte order mark and the header row alone

  Rule: Fields are quoted when they must be

    @boundary
    Scenario: A field that holds a separator is quoted
      Given a field holding a comma, a double quote, a "\r" or a "\n", or starting or ending with a space
      Then the field is wrapped in double quotes, with each double quote inside written twice
      And a field that needs none of this is written as it is, without quotes
      And this applies to every field, the id included

  Rule: A cell never runs as a formula

    @unhappy
    Scenario: A title that starts like a formula is defused
      Given a title starting with "=", "+", "-", "@", a tab or a "\r"
      Then the field starts with a single quote "'" before that character
      And the quoting rule then applies to the field as changed
      And only the first character is checked: "a=b" is written as it is

  Rule: Bad requests are refused

    @unhappy
    Scenario: A requisition that cannot be written is refused
      When a requisition has an unknown status, a title that is neither a string nor null, openings or filled that is not a whole number of at least 0, filled greater than openings, or a creation time that is not written as above or names no real time
      Then the answer is status 422 with "Content-Type: application/json; charset=utf-8" and the body {"error": <a message>, "id": <that requisition's id>}
      And when several requisitions are bad, the first in the request's order is the one named
      And no CSV is sent

    @unhappy
    Scenario: A body that is not a list of requisitions
      When the body is not JSON, is JSON but not an array, or holds an item that is not an object with a string "id"
      Then the answer is status 400 with "Content-Type: application/json; charset=utf-8" and the body {"error": <a message>}

    @unhappy
    Scenario: Other methods and paths
      When any method other than POST is sent to "/requisitions.csv"
      Then the answer is status 405 with the header "Allow: POST"
      And a request to any other path is answered status 404
```

Decided:

- The CSV is served at `POST /requisitions.csv` with the requisitions as a
  JSON array body; the answer is 200 with `text/csv; charset=utf-8` and
  `Content-Disposition: attachment; filename="requisitions.csv"`.
  Ticket: "the console's backend POSTs the employer's requisitions to it and streams the answer to the browser as the download"
  Instead: `GET /requisitions.csv` reading the requisitions from a store.
- `createdAt` is an ISO 8601 time with seconds and `Z` or an offset;
  anything else, or a time that does not exist, is invalid; the date written
  is the UTC date.
  Ticket: silent.
  Instead: accept anything `Date.parse` accepts, or epoch milliseconds.
- Rows are ordered by creation time, then by id compared as strings.
  Ticket: silent.
  Instead: keep the request's order.
- A bad requisition is a 422 with a JSON body naming the first bad
  requisition's id in request order; nothing of the CSV is sent.
  Ticket: silent.
  Instead: skip bad rows and export the rest, or a 400 for every refusal.
- A body that is not an array of objects with a string `id` is a 400 with a
  JSON `error`.
  Ticket: silent.
  Instead: 422 for every bad body.
- Other methods on the path are 405 with `Allow: POST`; other paths 404.
  Ticket: silent.
  Instead: 404 for everything not served.
- The quoting rule applies to every field, the id included; the formula
  rule to the title only.
  Ticket: silent.
  Instead: defuse formulas in every text field.
