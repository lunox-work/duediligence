# Export requisition list to CSV

Employers download their requisition list as a CSV file and open it in a
spreadsheet. The file must open cleanly in Excel and must not let a cell
run as a formula.

```gherkin
Feature: Build the requisitions CSV

  Background:
    Given requisitions, each with an id, a title, a status, a number of openings, a number filled and a creation time
    And the status is one of "open", "on_hold", "filled" or "cancelled"

  Rule: The file has a fixed layout

    @happy
    Scenario: The header and one row per requisition
      When the CSV is built
      Then it starts with a UTF-8 byte order mark, "﻿"
      And its first row is "Requisition ID,Title,Status,Openings,Filled,Created"
      And each requisition is one row after it, in order of creation time, then id
      And every row, the last included, ends with "\r\n"

    @happy
    Scenario: Values are written for people to read
      Then the status is written "Open", "On hold", "Filled" or "Cancelled"
      And the creation time is written as its UTC date, "YYYY-MM-DD"
      And numbers are written as plain digits
      And a missing title is an empty field

    @boundary
    Scenario: No requisitions
      When the CSV is built from none
      Then it is the byte order mark and the header row alone

  Rule: Fields are quoted when they must be

    @boundary
    Scenario: A field that holds a separator is quoted
      Given a title holding a comma, a double quote, a "\r" or a "\n", or starting or ending with a space
      Then the field is wrapped in double quotes, with each double quote inside written twice
      And a field that needs none of this is written as it is, without quotes

  Rule: A cell never runs as a formula

    @unhappy
    Scenario: A title that starts like a formula is defused
      Given a title starting with "=", "+", "-", "@", a tab or a "\r"
      Then the field starts with a single quote "'" before that character
      And the quoting rule then applies to the field as changed
      And only the first character is checked: "a=b" is written as it is

  Rule: Bad data is refused

    @unhappy
    Scenario: A requisition that cannot be written is refused
      When a requisition has an unknown status, openings or filled that is not a whole number of at least 0, filled greater than openings, or an invalid creation time
      Then building fails with an error naming that requisition's id
```
