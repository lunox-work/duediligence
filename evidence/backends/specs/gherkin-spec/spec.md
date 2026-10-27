# Generate the .spec Gherkin file from a ticket's acceptance criteria

A task's `.spec` folder starts empty. Its acceptance criteria are the natural
source of scenarios, so each criterion becomes a scenario in
`.spec/<KEY>.feature`, named after the ticket key. The file must parse with
a standard Gherkin parser, so its layout is fixed.

```gherkin
Feature: Write a ticket's acceptance criteria as a feature file

  Background:
    Given a ticket with a key, a title and a list of acceptance criteria, each a string
    And a key is uppercase letters and digits starting with a letter, a "-", then digits, such as "PAY-123"
    And the file's path is ".spec/" followed by the key and ".feature"

  Rule: The file has a fixed layout

    @happy
    Scenario: The file starts with the feature and lists one scenario per criterion
      Given ticket "PAY-123" titled "Retry failed payouts" with criteria "Failed payouts are retried" and "Retries stop after three attempts"
      When the file is generated
      Then its text is exactly
        """
        Feature: Retry failed payouts

          Scenario: Failed payouts are retried
            Then failed payouts are retried

          Scenario: Retries stop after three attempts
            Then retries stop after three attempts
        """
      And it ends with one "\n", lines end with "\n" alone, scenarios are indented two spaces and steps four, and one empty line comes before each scenario

    @happy
    Scenario: A criterion without step keywords becomes one Then step
      Given a criterion that does not start with "Given", "When" or "Then"
      Then its scenario has one step: "Then" and the criterion with its first character in lowercase
      And the first character is left as it is when the criterion's first word is two or more uppercase letters and nothing else, such as "API" or "UTC", or contains a digit; so "A payout" becomes "a payout"

    @happy
    Scenario: A criterion written as steps is split at its keywords
      Given the criterion "Given a payout failed When the retry job runs Then it is retried And the poster is told"
      Then the scenario's title is the whole criterion
      And its steps are "Given a payout failed", "When the retry job runs", "Then it is retried" and "And the poster is told"
      And a criterion counts as written in steps only when its first word is "Given", "When" or "Then", ignoring case
      And it is split before every whole word "Given", "When", "Then", "And" or "But", ignoring case, with each keyword written capitalized

  Rule: Criteria are cleaned first

    @boundary
    Scenario: List markers and stray whitespace are removed
      Given criteria written as "- a", "* b", "1. c", "2) d", "[ ] e" and "[x] f", with extra spaces, tabs or line breaks inside or around them
      Then the markers are removed once from the start, every run of whitespace becomes one space, and the ends are trimmed
      And the title is cleaned the same way, except for list markers

    @boundary
    Scenario: Empty and repeated criteria
      Given criteria that are empty once cleaned
      Then they produce no scenario
      And when two scenarios would have the same title, the second is titled with " (2)" after it, the third with " (3)", and so on

  Rule: A ticket without criteria still gets a file

    @unhappy
    Scenario: No criteria produce a TODO feature
      Given ticket "PAY-124" titled "Payout report" whose criteria are none, or all empty once cleaned
      When the file is generated
      Then its text is exactly
        """
        Feature: Payout report

          # TODO: PAY-124 has no acceptance criteria yet.
        """
      And it ends with one "\n"

    @unhappy
    Scenario: A ticket that cannot be named is refused
      Given a key that is not uppercase letters and digits, a "-" and digits, such as "pay-123", "PAY123" or "PAY-12A", or a title that is empty once cleaned
      When the file is generated
      Then it fails with an error naming the key or saying the title is empty
```
