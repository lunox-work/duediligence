# Daily question limit

Contributors can ask questions about a task's hidden code. Without a limit,
someone could map the codebase one question at a time. Each contributor gets
a fixed number of questions per task per day, and sees how many are left.

```gherkin
Feature: Limit questions per contributor per task per day

  Background:
    Given the limit is 20 questions per contributor per task per day
    And a day runs from 00:00 UTC to the next 00:00 UTC
    And the current time is read from a clock the caller supplies

  @happy
  Scenario: A contributor with no questions today has the full allowance
    Given contributor "c1" has asked nothing about task "t1" today
    When the remaining count for "c1" on "t1" is read
    Then it is 20
    And reading it does not use a question

  @happy
  Scenario: An accepted question uses one from the allowance
    Given contributor "c1" has asked nothing about task "t1" today
    When "c1" asks a question about "t1"
    Then the question is accepted
    And the result says 19 remain

  @boundary
  Scenario: The twentieth question is still accepted
    Given contributor "c1" has asked 19 questions about task "t1" today
    When "c1" asks a question about "t1"
    Then the question is accepted
    And the result says 0 remain

  @unhappy
  Scenario: The twenty-first question is refused with a clear message
    Given contributor "c1" has asked 20 questions about task "t1" today
    When "c1" asks a question about "t1"
    Then the question is refused
    And the result says 0 remain
    And the message is "Daily limit of 20 questions reached for this task. It resets at 00:00 UTC."

  @boundary
  Scenario: The count resets at midnight UTC
    Given contributor "c1" asked 20 questions about task "t1" on 2026-03-01
    When "c1" asks about "t1" at 2026-03-01T23:59:59.999Z
    Then the question is refused
    When "c1" asks about "t1" at 2026-03-02T00:00:00.000Z
    Then the question is accepted
    And the result says 19 remain

  @happy
  Scenario: Allowances are separate per task and per contributor
    Given contributor "c1" has asked 20 questions about task "t1" today
    When "c1" asks a question about task "t2"
    Then the question is accepted
    When contributor "c2" asks a question about task "t1"
    Then the question is accepted

  @unhappy
  Scenario: A question with no contributor or no task is rejected
    When a question is asked with an empty contributor id or an empty task id
    Then it fails with an error
    And no allowance is used
```
