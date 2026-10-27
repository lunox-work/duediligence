# Run jobs one at a time per key

Model calls for one task must run one at a time, in the order they were
asked for, while calls for different tasks run side by side up to a cap.
The queue that does this is used by every worker, so a job that fails, is
cancelled or throws must never leave its key stuck or a slot taken.

```gherkin
Feature: A queue that runs jobs serially per key and in parallel across keys

  Background:
    Given a queue created with a cap, the most jobs that may run at once
    And a job is a function that returns a promise, submitted with a key and an optional abort signal
    And submitting returns a promise that settles as the job's promise settles
    And a job has started once its function has been called, and has settled once the promise it returned has settled

  Rule: Jobs with one key run one at a time, in submission order

    @happy
    Scenario: Two jobs with one key run in order
      Given two jobs submitted with the same key, the first of which does not settle on its own
      When both are submitted
      Then the second has not started while the first is unsettled
      And the second starts after the first settles
      And each submission resolves with its own job's value

    @boundary
    Scenario: A failed job does not block its key
      Given a first job whose promise rejects and a second job with the same key
      When both are submitted
      Then the first submission rejects with the first job's error
      And the second job still runs, after the first has settled, and its submission resolves with its value

    @unhappy
    Scenario: A job that throws before returning a promise is a failed job
      Given a job function that throws synchronously
      When it is submitted
      Then the submission rejects with the thrown error
      And a job submitted afterwards with the same key still runs

  Rule: Jobs with different keys run side by side, up to the cap

    @happy
    Scenario: Jobs with different keys run at once
      Given a cap of 2 and two jobs with different keys, neither of which settles on its own
      When both are submitted
      Then both have started before either has settled

    @boundary
    Scenario: The cap holds across keys
      Given a cap of 2 and three jobs with three different keys, none of which settles on its own
      When all three are submitted
      Then the third has not started while the first two are unsettled
      And the third starts after one of them settles
      And jobs waiting for a slot start in submission order

    @boundary
    Scenario: A waiting job whose key is busy does not hold a slot
      Given a cap of 2 and a running job for key "a" that does not settle on its own
      And then a second job for key "a" is submitted, and then a job for key "b"
      When the job for key "b" is submitted
      Then it starts at once, although the second job for key "a" was submitted before it
      And the second job for key "a" starts only after the first one settles

  Rule: A submission can be aborted while it waits

    @unhappy
    Scenario: An aborted waiting job never runs
      Given a running job for key "a" that does not settle on its own
      And a second job for key "a" submitted with an abort signal
      When the signal is aborted before the second job has started
      Then the second submission rejects with the signal's reason
      And the second job's function is never called
      And a third job for key "a" submitted afterwards starts after the first one settles

    @boundary
    Scenario: Aborting a started job changes nothing
      Given a job submitted with an abort signal that has started and not settled
      When the signal is aborted
      Then the submission still settles as the job's promise settles
      And the job keeps its slot until it settles

    @unhappy
    Scenario: A signal already aborted at submission is refused
      Given an abort signal that is already aborted
      When a job is submitted with it
      Then the submission rejects with the signal's reason and the job's function is never called

  Rule: The queue reports its state

    @happy
    Scenario: Counts and idleness
      Given a cap of 1 and two jobs submitted with different keys, the first of which does not settle on its own
      Then the queue reports 1 job running and 1 job waiting
      And a promise that the queue is idle resolves only after both have settled
      And on a queue with nothing running or waiting, the idle promise is already resolved

    @unhappy
    Scenario: A cap that is not a positive whole number is refused
      Given a cap of 0, a cap of 2.5 or a negative cap
      When the queue is created
      Then creation fails with an error
```
