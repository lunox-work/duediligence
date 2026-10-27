# Sandbox status enum

Sandbox status has been stored as free text, so the same status is spelled
many ways and filters miss tasks. Statuses become a fixed set. New writes
use only its values, and every old spelling is read as one of them.

```gherkin
Feature: Read and write sandbox statuses

  Background:
    Given the statuses are "draft", "review", "published", "claimed" and "merged"
    And a stored value is cleaned before it is read: its ends are trimmed, it is lowercased, and every run of spaces, "-" and "_" becomes one space

  Rule: Old spellings are read as statuses

    @happy
    Scenario: A status written another way is read as itself
      When the stored values "Draft", " PUBLISHED ", "Merged" and "claimed" are read
      Then they are "draft", "published", "merged" and "claimed"

    @happy
    Scenario: Known old spellings are read as their status
      Given these cleaned spellings and the status each means:
        | spelling     | status    |
        | in review    | review    |
        | under review | review    |
        | reviewing    | review    |
        | live         | published |
        | public       | published |
        | assigned     | claimed   |
        | taken        | claimed   |
        | done         | merged    |
        | complete     | merged    |
        | completed    | merged    |
      When "In-Review", "under_review" and "LIVE" are read
      Then they are "review", "review" and "published"

    @unhappy
    Scenario: A value that is no status is not guessed
      When "closed", "archived", "drafts", "revew", an empty value or a value of only spaces is read
      Then it reads as no status at all, never as the nearest one

  Rule: Only statuses are written

    @happy
    Scenario: A status is written as itself
      When "review" is written
      Then the stored value is "review"

    @unhappy
    Scenario: Anything else is refused on write
      When "Review", "in-review", " draft" or "closed" is written
      Then it fails with an error that names the value as given
      And an old spelling is never accepted on write, only on read

  Rule: A whole table can be read at once

    @happy
    Scenario: Reading many rows reports what could not be read
      Given rows each with an id and a stored status value
      When they are read together
      Then each row comes back with its status, or no status
      And the result lists each distinct original value that read as no status once, sorted, exactly as it was stored
```
