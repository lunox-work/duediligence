# Invite codes for invite-only tasks

Company-borne tasks are invite only. The company hands a contributor a
code, and redeeming it grants access to that one task. A code works once,
for a limited time, and the company can see who used it.

```gherkin
Feature: Create and redeem invite codes

  Background:
    Given a registry over a store the caller supplies, with async "get" and "set" whose calls may take any time to resolve
    And a clock and a source of random integers the caller supplies
    And a code is 8 characters from "ABCDEFGHJKMNPQRSTVWXYZ23456789", each chosen by the random source

  Rule: Codes are made for a task

    @happy
    Scenario: A new code is unused and expires in 14 days
      When a code is created for task "t1" at 2026-03-01T09:00:00Z
      Then it is unused and expires at 2026-03-15T09:00:00Z
      And a code that would repeat one already in the registry is drawn again

  Rule: Redeeming grants access once

    @happy
    Scenario: Redeeming a code grants access to its task
      Given an unused code for "t1"
      When contributor "c1" redeems it
      Then "c1" has access to "t1" and to no other task
      And the code shows it was used by "c1", and when

    @boundary
    Scenario: A code is read however it is typed
      When a code is redeemed in lowercase, with spaces, or with a "-" in it
      Then it is the same code

    @boundary
    Scenario: A code expires exactly 14 days after it was made
      Given a code created at 2026-03-01T09:00:00Z
      Then it can be redeemed at 2026-03-15T08:59:59.999Z
      And at 2026-03-15T09:00:00Z redeeming fails with reason "expired"

    @unhappy
    Scenario: A used code cannot be used by someone else
      Given a code used by "c1"
      When "c2" redeems it
      Then it fails with reason "used" and "c2" gets no access
      And when "c1" redeems it again, it succeeds and nothing changes

    @unhappy
    Scenario: Unknown and revoked codes are refused
      When a code that was never made is redeemed, it fails with reason "unknown"
      And when a revoked code is redeemed, it fails with reason "revoked"
      And when a code used by "c1" is revoked, redeeming it fails with reason "revoked" for "c1" and "c2" alike

    @boundary
    Scenario: A contributor needs only one code per task
      Given "c1" already has access to "t1"
      When "c1" redeems another unused code for "t1"
      Then it fails with reason "already has access" and that code stays unused

  Rule: Revoking a used code takes back its access

    @happy
    Scenario: Revoking a used code withdraws the access it granted
      Given "c1" used a code for "t1" and also has access to "t2"
      When the code is revoked
      Then "c1" no longer has access to "t1" and still has access to "t2"

    @boundary
    Scenario: A used code can be revoked after its expiry time
      Given a code created at 2026-03-01T09:00:00Z and used by "c1" before it expired
      When it is revoked at 2026-03-20T09:00:00Z
      Then it is revoked and "c1" no longer has access to its task

    @boundary
    Scenario: Access taken back can be regained with another code
      Given a code for "t1" used by "c1" and then revoked
      When "c1" redeems another unused code for "t1"
      Then it succeeds and "c1" has access to "t1" again
      And revoking a code that is already revoked changes nothing, so "c1" keeps that access

  Rule: Two redemptions at once

    @concurrency
    Scenario: Only one of two simultaneous redemptions wins
      Given an unused code and a store whose calls resolve after other work has run
      When "c1" and "c2" redeem it at the same time
      Then exactly one of them succeeds and the other fails with reason "used"
      And exactly one contributor has access through it

  Rule: The company sees its codes

    @happy
    Scenario: A task's codes are listed with their state
      When the codes for "t1" are listed
      Then each shows its code, when it was made, when it expires, and its state: "unused", "used", "expired" or "revoked"
      And a used code shows who used it and when, and stays "used" after its expiry time
      And a used code that was revoked shows "revoked", and still shows who used it and when
```
