# Import a payout statement

Finance uploads the bank's payout statement so payouts can be matched to
contributors. Most uploads are wrong somewhere, and the person fixing one
needs every problem listed at once, by line and field, rather than one at
a time. A statement with any error imports nothing.

```gherkin
Feature: Validate and parse a payout statement

  Background:
    Given a statement as text: a header line, then one line per payout, with fields separated by ";"
    And the fields, in order: "id", "date", "amount", "currency", "reference"
    And the import takes the statement, the set of accepted currency codes, and today's date as "YYYY-MM-DD"
    And importing returns either the payouts, each with its id, date, amount in cents as a whole number, currency and reference, or the errors, each with a line number counting the header as line 1, the field name or no field, a code, and the text of the offending field or line
    And errors are listed in line order, and within a line in field order
    And every line is checked: an error on one line does not stop the lines after it

  Rule: The header is checked first and alone

    @unhappy
    Scenario: A wrong header is the only error
      Given a statement whose first line is not exactly "id;date;amount;currency;reference"
      When it is imported
      Then the result is one error, line 1, no field, code "header", even when later lines are also wrong
      And an empty statement is a "header" error on line 1

  Rule: Every line is checked, every field is checked

    @happy
    Scenario: A correct statement imports
      Given a header and lines such as "p-1;2026-03-31;120.50;SGD;March payout"
      When it is imported
      Then the payouts are returned in line order, with amount 12050, and an empty reference when the field is empty

    @unhappy
    Scenario: A line with the wrong number of fields
      Given a line with four or six fields
      When it is imported
      Then the error is that line, no field, code "fields", with the whole line as text
      And none of the line's fields is checked further

    @unhappy
    Scenario: A bad id
      Given an id that is empty, longer than 32 characters, or has a character other than letters, digits and "-"
      When it is imported
      Then the error is code "id" on field "id"

    @unhappy
    Scenario: A repeated id
      Given two lines with the same id
      When it is imported
      Then the second line has an error with code "duplicate" on field "id", and the first line does not
      And the comparison is exact: "P-1" and "p-1" are different ids

    @unhappy
    Scenario: A bad date
      Given a date that is not "YYYY-MM-DD", or is not a day in the calendar, such as "2026-02-30" or "2025-02-29"
      When it is imported
      Then the error is code "date" on field "date"
      And "2024-02-29" is a day in the calendar
      And a date after today's date is code "future" on field "date"

    @unhappy
    Scenario: A bad amount
      Given an amount that is not digits, a ".", and exactly two more digits, or is "0.00", or has a sign, a space or a thousands separator
      When it is imported
      Then the error is code "amount" on field "amount"
      And "0.01" is accepted as 1 cent and "1234567.89" as 123456789 cents

    @unhappy
    Scenario: A bad currency
      Given a currency that is not in the set of accepted codes
      When it is imported
      Then the error is code "currency" on field "currency"
      And the comparison is exact: "sgd" is not "SGD"

    @unhappy
    Scenario: A bad reference
      Given a reference longer than 140 characters, or holding a character whose code is below 32
      When it is imported
      Then the error is code "reference" on field "reference"
      And a reference may be empty

    @boundary
    Scenario: One line, several errors
      Given a line whose date, amount and currency are all wrong
      When it is imported
      Then the line has three errors, in field order
      And a statement with errors on lines 3 and 2 lists line 2's first

  Rule: Line endings, the final newline and size

    @boundary
    Scenario: Windows line endings and a byte-order mark
      Given a statement whose lines end with "\r\n" and that starts with the byte-order mark "﻿"
      When it is imported
      Then it imports as the same statement without them
      And a field's text in an error carries no "\r"

    @boundary
    Scenario: A final newline is fine, an empty line is not
      Given a statement that ends with one newline after its last line
      When it is imported
      Then there is no error for the text after it
      And an empty line anywhere else, including two newlines at the end, is an error on that line, no field, code "blank"

    @boundary
    Scenario: Errors are capped and counted
      Given a statement with more than 100 errors
      When it is imported
      Then the first 100 errors are listed in order, and the total number of errors found is reported

    @unhappy
    Scenario: Too many lines
      Given a statement with more than 10000 payout lines
      When it is imported
      Then the result is one error, line 10002, no field, code "too-many", and no other line is reported
      And a statement with exactly 10000 payout lines is checked as usual
```
