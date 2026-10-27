# Gherkin parser returning scenarios and steps

Spec generation and mutation reports both read `.feature` files. They need
each scenario with its steps and line numbers, and an error that names the
line when a file is not valid.

```gherkin
Feature: Parse a feature file

  Background:
    Given the text of a feature file, whose lines end with "\n" or "\r\n"
    And line numbers count from 1
    And a line's keyword is read after its leading spaces and tabs

  Rule: Valid files are read in order

    @happy
    Scenario: Scenarios and steps are returned with their lines
      Given a file with "Feature: Payouts" and two scenarios with steps
      When it is parsed
      Then the result has the feature's name "Payouts" and its scenarios in file order
      And each scenario has its name, its line, and its steps in order
      And each step has its keyword as written ("Given", "When", "Then", "And", "But" or "*"), its text after the keyword and one space, and its line

    @happy
    Scenario: Comments, tags, descriptions and blank lines
      Then a line starting with "#" is a comment and is skipped
      And a line starting with "@" holds tags separated by spaces, which belong to the next scenario
      And lines between "Feature:" and the first "Background:", "Scenario:" or tag line are the feature's description and are skipped
      And blank lines are skipped everywhere

    @happy
    Scenario: A background is returned on its own
      Given a "Background:" before the first scenario
      Then its steps are returned as the background, and are not copied into the scenarios

    @boundary
    Scenario: Doc strings and tables belong to the step before them
      Given a step followed by a doc string between two lines of three double quotes
      Then the step has the doc string's lines, with the indentation of the opening quotes removed from each
      And lines inside the doc string are never read as keywords, comments or tags
      And a step followed by lines starting with "|" has them as a table, each row's cells trimmed

  Rule: Invalid files name the line

    @unhappy
    Scenario: Errors carry the line where the file goes wrong
      When the file has no "Feature:" line before any other content, the error is at the first such line
      And a second "Feature:" line, a step before any "Background:" or "Scenario:", or a line inside a scenario that is none of the forms above, fails at that line
      And a doc string that is never closed fails at the line that opened it
      And "Scenario Outline:" fails at its line, saying it is not supported
      And each error is a ParseError with a "line" property and a message that includes "line <n>"

    @boundary
    Scenario: An empty feature is valid
      Given a file with only "Feature: Empty"
      Then it parses with no scenarios and no background
```
