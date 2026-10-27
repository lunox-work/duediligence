# Release the escrow in two parts

A task's bounty is locked in escrow when it is posted. When a submission's
hidden tests pass, the contributor receives the hidden-test share. When the
maintainer approves UAT, they receive the rest. The payment worker
delivers events at least once, sometimes twice at the same moment, and
money must never move twice.

```gherkin
Feature: Release escrow on gate events

  Background:
    Given a task with a bounty in whole minor units, at least 0, and a hidden-test share in basis points from 0 to 10000, by default 7500
    And events for the task, each with an id and a kind: "hidden-tests-passed", "hidden-tests-failed" or "uat-approved"
    And events are handled by an async "handle(event)" over a store the caller supplies, with async "get" and "set"

  Rule: The two releases

    @happy
    Scenario: Passing hidden tests releases the share
      Given a bounty of 10000 and the default share
      When "hidden-tests-passed" is handled
      Then a release of 7500 is recorded
      And the task is "partially released"

    @boundary
    Scenario: The share is rounded down, and the rest goes with UAT
      Given a bounty of 999 and a share of 7500
      Then the hidden-test release is 749, rounded down from 749.25
      And the UAT release is 250, so the two always add up to the bounty
      And the amount is exact for any bounty up to Number.MAX_SAFE_INTEGER

    @happy
    Scenario: UAT approval releases the rest
      Given the hidden-test share was released
      When "uat-approved" is handled
      Then a release of the remaining balance is recorded
      And the task is "fully released"

    @unhappy
    Scenario: A failed run releases nothing
      When "hidden-tests-failed" is handled
      Then nothing is recorded and the task stays "locked"

    @unhappy
    Scenario: UAT approval before the hidden tests pass is refused
      Given the hidden-test share has not been released
      When "uat-approved" is handled
      Then it fails with an error saying the hidden tests have not passed
      And nothing is recorded

    @boundary
    Scenario: A bounty of 0 is pro bono
      Given a bounty of 0
      Then no release is ever recorded and the task is "pro bono"

  Rule: Money moves once

    @concurrency
    Scenario: A repeated event is handled once
      Given event "e1" of kind "hidden-tests-passed" was handled
      When "e1" is handled again
      Then nothing more is recorded
      And a different event of kind "hidden-tests-passed" after the share was released records nothing either

    @concurrency
    Scenario: The same event delivered twice at once is handled once
      Given a store whose calls resolve after other work has run
      When "hidden-tests-passed" is handled twice at the same time, with the same id or with different ids
      Then exactly one release is recorded
      And the same holds for "uat-approved"

    @recovery
    Scenario: A failed save releases nothing and can be retried
      Given the store rejects the next "set"
      When an event is handled
      Then handling rejects with the store's error and nothing is recorded
      And handling the same event again succeeds
```
