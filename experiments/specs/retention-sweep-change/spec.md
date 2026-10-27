# Decide what the nightly sweep may delete

Records are kept only as long as policy allows and no longer, but nothing
is deleted while a hold is on it, nothing is deleted without a policy that
says so, and everything is flagged for a while before it goes. The sweep
decides; another job deletes.

```gherkin
Feature: Select records for deletion under the retention policy

  Background:
    Given records, each with an id, a category, a created date, an optional last-accessed date, a list of hold names, a region, and an optional parent record id
    And a policy with, per category, a retention period in days and whether it is counted from last access; a list of regions each with a minimum period in days; and a grace period in days
    And a run date; all dates are "YYYY-MM-DD" and ages are whole calendar days between dates
    And the sweep returns, for each record in input order, a decision "keep", "flag" or "delete" with a reason

  Rule: Age against the period

    @happy
    Scenario: A record past its period is flagged, then deleted
      Given a category with a period of 30 days counted from creation, a grace period of 7 days, and a record created 2026-01-01
      When the run date is 2026-01-30 the decision is "keep" with reason "within period"
      And when the run date is 2026-01-31 the decision is "flag" with reason "expired"
      And when the run date is 2026-02-06 the decision is "flag" and when it is 2026-02-07 the decision is "delete" with reason "expired"

    @boundary
    Scenario: A grace period of zero deletes at once
      Given a grace period of 0
      When a record's age reaches its period
      Then the decision is "delete" with reason "expired"

    @happy
    Scenario: Access-based categories count their period from the last access
      Given a category counted from last access with a period of 90 days, and a record created 2025-01-01 and last accessed 2026-01-01
      When the run date is 2026-03-01
      Then the decision is "keep" with reason "within period"
      And a record in that category never accessed counts from its created date
      And only the category's period counts from the last access; a region's minimum always counts from the created date

    @boundary
    Scenario: A region's minimum counts from creation and can lengthen the period
      Given a category with a period of 30 days counted from creation, a region "eu" with a minimum of 60 days, and a record in "eu" created 2026-01-01
      When the run date is 2026-02-15
      Then the decision is "keep" with reason "within period"
      And a region not in the list changes nothing
      And a region minimum shorter than the category's period changes nothing
      And a record expires on the later of two dates: its counting date plus the category's period, and its created date plus the region's minimum

    @happy
    Scenario: A recent access does not restart a region's minimum
      Given a category counted from last access with a period of 90 days, a region "eu" with a minimum of 365 days, a grace period of 7 days, and a record in "eu" created 2025-01-01 and last accessed 2026-01-01
      When the run date is 2026-03-31 the decision is "keep" with reason "within period"
      And when the run date is 2026-04-01 the decision is "flag" with reason "expired"
      And when the run date is 2026-04-07 the decision is "flag" and when it is 2026-04-08 the decision is "delete" with reason "expired"

    @boundary
    Scenario: The grace period runs from the later expiry
      Given a category counted from last access with a period of 90 days, a region "eu" with a minimum of 365 days, a grace period of 7 days, and a record in "eu" created 2025-12-01 and last accessed 2026-01-01
      When the run date is 2026-04-01, with the period since last access passed but not the minimum since creation, the decision is "keep" with reason "within period"
      And when the run date is 2026-12-01 the decision is "flag" with reason "expired"
      And when the run date is 2026-12-07 the decision is "flag" and when it is 2026-12-08 the decision is "delete" with reason "expired"

    @boundary
    Scenario: Ages are calendar days
      Given a record created 2024-02-28 in a category with a period of 366 days and a grace period of 0
      When the run date is 2025-02-28 the decision is "delete"
      And when the run date is 2025-02-27 the decision is "keep"

  Rule: Holds and policies come first

    @happy
    Scenario: A held record is kept
      Given a record with holds ["litigation-7", "audit-2026"] that is long past its period
      When the sweep runs
      Then the decision is "keep" with reason "hold:audit-2026", the first hold when sorted
      And an empty list of holds is no hold

    @unhappy
    Scenario: A record with no policy is kept
      Given a record whose category is not in the policy
      When the sweep runs
      Then the decision is "keep" with reason "no policy"

    @unhappy
    Scenario: Impossible dates are refused
      Given a record created after the run date, or last accessed before it was created
      When the sweep runs
      Then the sweep fails with an error naming the record's id
      And a record last accessed after the run date is refused the same way

  Rule: Children follow a kept parent

    @happy
    Scenario: A child of a kept record is kept
      Given a record "p" that is kept because of a hold and a record "c" with parent "p" that is past its period and grace
      When the sweep runs
      Then "c" is "keep" with reason "parent:p"
      And a child of a record that is flagged or deleted follows its own age

    @boundary
    Scenario: Keeping passes down every level
      Given "a" kept by a hold, "b" with parent "a", and "c" with parent "b", "b" and "c" both long expired
      When the sweep runs
      Then "b" is "keep" with reason "parent:a" and "c" is "keep" with reason "parent:b"
      And the order of the records in the input does not change the decisions

    @unhappy
    Scenario: A parent that is not in the input
      Given a record whose parent id is not among the records
      When the sweep runs
      Then the sweep fails with an error naming the record's id
```
