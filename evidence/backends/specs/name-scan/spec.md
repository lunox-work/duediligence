# Find workspace names in published files

A public copy of a codebase must not say whose code it is. Before it is
published, every file is scanned for the names the workspace goes by: the
organization, its repositories and its products. A name is found however
the code happens to spell it, so `harbor-lights` is also found as
`harborLights`, `HARBOR_LIGHTS` and `Harbor Lights`.

```gherkin
Feature: Scan files for workspace names

  Background:
    Given a list of terms and a set of files, each with a path and text
    And a word is a run of Unicode letters and digits, split further where a lowercase letter is followed by an uppercase one ("harborLights" is "harbor" and "lights") and where an uppercase letter is followed by an uppercase then a lowercase one ("ACMEOrders" is "ACME" and "Orders")
    And words are compared ignoring case
    And a term is the sequence of its words: "Harbor-Lights" and "harbor lights" are the same term

  Rule: A term matches the same words in a row, whatever joins them

    @happy
    Scenario: Spellings of one term are all found
      Given the term "harbor-lights"
      When a file holds "harborLights", "HARBOR_LIGHTS", "harbor.lights" and "Harbor Lights"
      Then each of the four is a match

    @happy
    Scenario: A term is found inside a longer identifier at word boundaries
      Given the term "acme"
      When a file holds "acmeOrders", "MyAcme", "ACMEOrders", "acmes" and "pacme"
      Then "acmeOrders", "MyAcme" and "ACMEOrders" contain matches
      And "acmes" and "pacme" do not, because the term must start and end on a word boundary

    @boundary
    Scenario: Words written together with no boundary are one word
      Given the term "harbor-lights"
      When a file holds "harborlights"
      Then it is not a match

    @boundary
    Scenario: A match does not cross a line
      Given the term "harbor-lights"
      When a file holds "harbor" at the end of one line and "lights" at the start of the next
      Then it is not a match
      And within a line, any run of characters that are not letters or digits may join the words

  Rule: Some terms say nothing about whose code it is

    @boundary
    Scenario: Short and generic terms are not scanned for
      Given the terms "api", "Web", "x1", "core", "demo" and "12345"
      When any file is scanned
      Then none of them is reported
      And a term is skipped when it has fewer than 4 letters and digits in all, when it is one of the words "admin", "api", "app", "client", "core", "demo", "example", "internal", "main", "server", "test" or "web", or when it has no letter at all

  Rule: Matches are reported precisely

    @happy
    Scenario: Each match says where it is and what it says
      When a match is found
      Then it is reported with the file's path, the term as given, the line and column where it starts (both from 1, columns counting UTF-16 code units), and the matched text exactly as written in the file
      And a file's lines are split at "\n", with a trailing "\r" not part of the line's text

    @happy
    Scenario: A file's path is scanned too
      Given the term "harbor-lights"
      When a file's path is "packages/harbor-lights/src/index.ts"
      Then a match is reported for it with line 0 and the column in the path

    @boundary
    Scenario: Overlapping matches keep the longest
      Given the terms "harbor" and "harbor lights"
      When a file holds "harborLights"
      Then one match is reported, for "harbor lights"
      And where two matches overlap, the longer matched text wins, and of two the same length, the term given first wins
      And matches that do not overlap are all reported

    @happy
    Scenario: Results are in a stable order
      When several files and terms are scanned
      Then matches are ordered by path, then line, then column

    @unhappy
    Scenario: A file that is not text is refused
      When a file's text contains a NUL character
      Then that file is not scanned
      And it is listed among the skipped paths
```
