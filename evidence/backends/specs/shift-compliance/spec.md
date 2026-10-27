# Check a roster against the working-time rules

Before a roster is published it is checked against the working-time policy
the deployment runs under: how long a shift may be, how many hours a week,
how much rest between shifts, when a break is due, and how many days in a
row. Every breach is listed with the shifts it concerns, so the planner can
fix the roster rather than guess.

```gherkin
Feature: Find working-time violations in a worker's shifts

  Background:
    Given a worker's shifts, each with a start and an end as ISO 8601 date-times with a UTC offset, such as "2026-03-02T09:00:00+08:00", and break minutes, 0 when none
    And a policy with the most hours per shift, the most hours per week, the fewest rest minutes between shifts, the shift length in hours above which a break is due, the fewest break minutes that break must have, and the most days in a row
    And a shift's hours are its end minus its start, minus its break
    And a shift's day is the calendar date of its start in the offset it is written with; its week starts on the Monday of that day
    And checking returns the violations, each with a code, the indexes of the shifts concerned in the order given, the measured value, and the limit
    And violations are ordered by their first shift index, then by code alphabetically
    And an input shift may come in any order; indexes are positions in the input

  Rule: One shift at a time

    @happy
    Scenario: A shift longer than the maximum
      Given a maximum of 10 hours per shift and a shift of 11 hours with a 30-minute break
      When the roster is checked
      Then there is a violation with code "shift-hours", that shift's index, measured 10.5 and limit 10
      And a shift measuring exactly 10 hours is not a violation

    @happy
    Scenario: A long shift without its break
      Given a break due above 6 hours of at least 30 minutes, and a shift of 8 hours with a 20-minute break
      When the roster is checked
      Then there is a violation with code "break", measured 20 and limit 30
      And a shift of exactly 6 hours needs no break
      And the shift length for the break rule is the shift's end minus its start, before the break is taken off

    @boundary
    Scenario: A shift across midnight belongs to the day it starts
      Given a shift from 22:00 to 06:00 the next morning
      When the roster is checked
      Then it counts toward the day and the week of its start for every rule that counts days or weeks

  Rule: Shifts in relation to each other

    @happy
    Scenario: Too little rest between shifts
      Given at least 11 hours of rest and a shift ending at 23:00 followed by one starting at 08:00 the next day
      When the roster is checked
      Then there is a violation with code "rest", the two shifts' indexes with the earlier first, measured 9 hours and limit 11
      And rest is measured between consecutive shifts when sorted by start, whatever order they were given in
      And exactly 11 hours of rest is not a violation

    @unhappy
    Scenario: Overlapping shifts
      Given two shifts where the second starts before the first ends
      When the roster is checked
      Then there is a violation with code "overlap" with both indexes, measured the overlap in hours, and no limit
      And both shifts still count toward every other rule
      And two shifts where one ends exactly when the other starts do not overlap, and their rest is 0

    @happy
    Scenario: Too many hours in a week
      Given a maximum of 44 hours per week and six shifts of 8 hours from Monday to Saturday
      When the roster is checked
      Then there is a violation with code "week-hours", the indexes of all six shifts, measured 48 and limit 44
      And a Sunday shift of 8 hours in the same week belongs to that week, and the Monday after it to the next

    @boundary
    Scenario: Weeks follow the shift's own offset
      Given a shift starting "2026-03-08T23:30:00-05:00", a Sunday there, and one starting "2026-03-09T00:30:00+08:00", a Monday there
      When the roster is checked
      Then the first belongs to the week of Monday 2026-03-02 and the second to the week of Monday 2026-03-09

    @happy
    Scenario: Too many days in a row
      Given a maximum of 6 days in a row and shifts on seven consecutive days
      When the roster is checked
      Then there is a violation with code "consecutive-days", the indexes of all seven shifts, measured 7 and limit 6
      And two shifts on the same day count as one day
      And a day without a shift ends the run, and the count starts again

    @boundary
    Scenario: A run of days is reported once
      Given a maximum of 6 days in a row and shifts on nine consecutive days
      When the roster is checked
      Then there is one "consecutive-days" violation for the run, with all nine indexes and measured 9
      And a run across a week boundary is one run

  Rule: Bad shifts are refused

    @unhappy
    Scenario: A shift that does not end after it starts
      Given a shift whose end is at or before its start
      When the roster is checked
      Then checking fails with an error naming the shift's index

    @unhappy
    Scenario: A break longer than the shift
      Given a shift of 4 hours with a 300-minute break, or a negative break
      When the roster is checked
      Then checking fails with an error naming the shift's index
```
