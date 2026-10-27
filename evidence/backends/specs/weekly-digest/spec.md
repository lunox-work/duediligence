# Weekly digest of open tasks

Engineering leads lose track of posted tasks that have stalled. Every
Monday morning, in the organization's own time zone, they get a digest of
their open tasks with what has happened on each.

```gherkin
Feature: Build the weekly digest

  Background:
    Given an organization's time zone, an IANA name such as "Asia/Singapore" or "America/New_York"
    And tasks, each with an id, a title, a status of "open" or "merged", a posting time and its submissions
    And each submission has a time and the furthest gate it reached, 1, 2 or 3
    And all times are instants, and "now" is given by the caller

  Rule: The digest goes out on Monday, local time

    @happy
    Scenario: The digest is due during Monday in the organization's time zone
      Given the time zone "Asia/Singapore"
      When now is 2026-03-01T16:30:00Z, which is Monday 00:30 in Singapore
      Then the digest is due
      And at 2026-03-01T15:59:59Z, still Sunday in Singapore, it is not

    @boundary
    Scenario: Daylight saving time moves the local day, not the rule
      Given the time zone "America/New_York"
      When now is 2026-03-09T04:30:00Z, Monday 00:30 after clocks went forward on Sunday 8 March
      Then the digest is due
      And at 2026-03-09T03:59:59Z, Sunday 23:59:59 local, it is not

  Rule: Each open task is listed with its state

    @happy
    Scenario: An open task is listed with age, submissions and furthest gate
      Given an open task posted 10 days before now with submissions reaching gates 1 and 2
      When the digest is built
      Then the task is listed with age 10, 2 submissions and furthest gate 2
      And a task with no submissions has furthest gate 0
      And merged tasks are not listed

    @boundary
    Scenario: Age counts whole 24-hour periods
      Given a task posted 9 days and 23 hours before now
      Then its age is 9
      And a task posted exactly 10 days before now has age 10

  Rule: Stalled tasks are flagged

    @boundary
    Scenario: A task is stalled after 14 days without a submission
      Then a task is stalled when its latest submission, or its posting if it has none, is 14 days or more before now
      And a task whose latest submission is 13 days and 23 hours before now is not stalled
      And a task posted 30 days ago with a submission 2 days ago is not stalled

    @happy
    Scenario: Stalled tasks come first
      When the digest is built
      Then stalled tasks are listed first, then the others
      And within each group, older tasks come first, then by id

    @happy
    Scenario: The subject counts the tasks
      Given 5 open tasks of which 2 are stalled
      Then the subject is "Weekly digest: 5 open tasks, 2 stalled"
      And with one open task it reads "1 open task", and "0 stalled" when none is stalled

  Rule: An empty digest is not sent

    @unhappy
    Scenario: Nothing open means no digest
      Given no task is open
      When the digest is built
      Then there is no digest at all, rather than an empty one

    @unhappy
    Scenario: An unknown time zone is refused
      When the time zone is "Mars/Olympus"
      Then it fails with an error naming the time zone
```
