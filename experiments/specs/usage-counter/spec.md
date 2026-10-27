# Per-task token usage counter

Token spend is metered per task for both payment modes. Every model call
reports its tokens and cost, many calls run at once, and the totals must
be exact: they decide what a contributor is charged.

```gherkin
Feature: Count token usage per task and contributor

  Background:
    Given a counter created over a store the caller supplies
    And the store has an async "get(key)" that resolves to the saved value or undefined, and an async "set(key, value)" that saves it
    And the store's calls may take any time to resolve, and "set" may reject
    And a usage report has a task id, a contributor id, input tokens, output tokens and a cost in micro-dollars, each count a whole number of at least 0

  Rule: Totals are exact sums

    @happy
    Scenario: A report adds to the task's and the contributor's totals
      Given a new store
      When contributor "c1" reports 1000 input tokens, 200 output tokens and cost 3400 on task "t1"
      Then task "t1" totals 1000 input, 200 output and 3400 cost
      And contributor "c1" on task "t1" totals the same

    @happy
    Scenario: Totals are kept per task and per contributor on that task
      Given reports by "c1" and "c2" on "t1", and by "c1" on "t2"
      Then each task's total is the sum of its own reports
      And each contributor's total on a task is the sum of their reports on that task only

    @boundary
    Scenario: Large totals stay exact
      When reports add up past 2 to the power 53
      Then totals are exact, with no rounding

    @unhappy
    Scenario: A malformed report is refused
      When a report has an empty task or contributor id, or a count that is negative, fractional or not a number
      Then the report fails with an error and no total changes

  Rule: Reports may overlap

    @concurrency
    Scenario: Overlapping reports lose nothing
      Given a store whose calls resolve after other work has run
      When 50 reports on one task are made at once, without waiting for each other
      Then the task's totals are the exact sum of all 50
      And each report's promise resolves only once its totals are saved

    @concurrency
    Scenario: Reports on different tasks do not wait for each other
      Given a report on "t1" whose store call has not resolved
      When a report on "t2" is made
      Then the report on "t2" can finish before the one on "t1"

  Rule: A failed save changes nothing

    @recovery
    Scenario: A report whose save fails is not counted
      Given the store rejects the next "set"
      When a report is made
      Then the report's promise rejects with the store's error
      And no total includes it, in the store or as the counter reads it
      And reports made after it are counted normally

  Rule: Totals survive a restart

    @recovery
    Scenario: A new counter over the same store sees the totals
      Given reports were counted and their promises resolved
      When a new counter is created over the same store
      Then it reads the same totals
      And new reports add to them

    @happy
    Scenario: Unknown totals read as zero
      When the totals of a task or contributor with no reports are read
      Then each count is 0
```
