# Gherkin parser returning scenarios and steps

Spec generation and mutation reports both read `.feature` files. `parseFeature`
in `src/index.ts` turns the text of one feature file into a `Feature`: its name,
its background steps and its scenarios in file order, each step carrying its
keyword, text, line, doc string and data table. A file that is not valid makes
it throw a `ParseError` whose `line` and message name the first line where the
file goes wrong. There is no Gherkin package to wrap; the parser is written
here, supports English keywords only, and deliberately supports less than full
Gherkin (no Scenario Outlines, no descriptions under a Background or Scenario).

How to read the scenarios below:

- "the feature text" is given as a doc string, so it is the doc string's lines
  with the opening quotes' indentation removed, joined with `"\n"`, and ending
  in `"\n"`. Line 1 is the doc string's first line. Inside those doc strings,
  `\"\"\"` stands for three double quotes (the escape rule in this spec).
- Text given in quotes after "the feature text is the JavaScript string", and
  every cell of a `text` or `docString` column, is JavaScript source read
  exactly as written (`\n`, `\r`, `\t`, `﻿`, `\"`, `\\` as in
  JavaScript, where `\|` is simply `|`); table escapes are not applied to it.
  In other table cells, `\|` stands for `|`.
- "the result is" means deep equality with the JSON shown. In `scenarios`
  tables, `tags` lists the tags separated by single spaces (empty for none).
  In `steps` tables, `docString` and `table` are `null` unless a column shows
  them.
- An error row means `parseFeature` throws a `ParseError` whose `line` is the
  `line` column and whose `message` is exactly the `message` column.

```gherkin
Feature: parseFeature reads a feature file into a Feature

  Rule: A valid file yields its name, background and scenarios in file order
    Each scenario has its name, the line of its "Scenario:" line, its own tags
    and its steps in order. Each step has its keyword as written, its text, its
    line, and docString and table set to null when it has none. Background
    steps are returned once in background and are not copied into scenarios.

    @happy
    Scenario: A typical file
      Given the feature text:
        """
        Feature: Checkout
          Shoppers pay for what is in their basket.

          Background:
            Given a basket with 2 items

          @happy @smoke
          Scenario: Pay by card
            When the shopper pays by card
            Then the order is placed

          Scenario: Empty basket
            Given an empty basket
            * the shopper pays
        """
      When parseFeature is called
      Then the result is:
        """
        {
          "name": "Checkout",
          "background": [
            { "keyword": "Given", "text": "a basket with 2 items", "line": 5, "docString": null, "table": null }
          ],
          "scenarios": [
            {
              "name": "Pay by card",
              "line": 8,
              "tags": ["@happy", "@smoke"],
              "steps": [
                { "keyword": "When", "text": "the shopper pays by card", "line": 9, "docString": null, "table": null },
                { "keyword": "Then", "text": "the order is placed", "line": 10, "docString": null, "table": null }
              ]
            },
            {
              "name": "Empty basket",
              "line": 12,
              "tags": [],
              "steps": [
                { "keyword": "Given", "text": "an empty basket", "line": 13, "docString": null, "table": null },
                { "keyword": "*", "text": "the shopper pays", "line": 14, "docString": null, "table": null }
              ]
            }
          ]
        }
        """

    @boundary
    Scenario: A file with only a Feature line
      Given the feature text is the JavaScript string "Feature: Lonely\n"
      When parseFeature is called
      Then the result is:
        """
        { "name": "Lonely", "background": null, "scenarios": [] }
        """

    @boundary
    Scenario: An empty Background and a Scenario without steps
      Given the feature text is the JavaScript string "Feature: F\nBackground:\nScenario: S\n"
      When parseFeature is called
      Then the result is:
        """
        { "name": "F", "background": [], "scenarios": [ { "name": "S", "line": 3, "tags": [], "steps": [] } ] }
        """

  Rule: Lines end with "\n" or "\r\n" and are numbered from 1, counting every line
    Only "\n" ends a line; a "\r" directly before it is removed, and the two
    endings may be mixed in one file. A lone "\r" is an ordinary character. The
    last line needs no line ending. A leading byte order mark "﻿" is
    removed. Blank lines and comment lines count towards line numbers.

    @happy
    Scenario: Windows line endings
      Given the feature text is the JavaScript string "Feature: F\r\n  Scenario: S\r\n    Given x\r\n"
      When parseFeature is called
      Then the result is:
        """
        { "name": "F", "background": null, "scenarios": [ { "name": "S", "line": 2, "tags": [], "steps": [
          { "keyword": "Given", "text": "x", "line": 3, "docString": null, "table": null } ] } ] }
        """

    @boundary
    Scenario: Mixed endings, missing final newline, byte order mark and lone carriage return
      When parseFeature is called with each text
      Then the results are:
        | text                                       | name  | scenario line | step line | step text |
        | "Feature: F\nScenario: S\r\nGiven x"       | F     | 2             | 3         | x         |
        | "﻿Feature: F\nScenario: S\nGiven x\n" | F     | 2             | 3         | x         |
        | "Feature: A\rB\nScenario: S\nGiven x\r\n"  | A\rB  | 2             | 3         | x         |
      And in the third row the name is the 3-character string "A", "\r", "B"

    @happy
    Scenario: Blank lines and comments count towards line numbers
      Given the feature text:
        """
        # language: en
        Feature: F

          # a comment
          Scenario: S

            Given x
        """
      When parseFeature is called
      Then the feature name is "F"
      And the scenarios are:
        | name | line | tags |
        | S    | 5    |      |
      And scenario "S" has the steps:
        | keyword | text | line |
        | Given   | x    | 7    |

  Rule: Outside doc strings, lines are trimmed, blank lines and comments are ignored, and keywords are case-sensitive
    Every line outside a doc string is trimmed of leading and trailing
    whitespace (as String.prototype.trim) before it is recognised, so any
    indentation, with spaces or tabs, is allowed. A line whose trimmed text is
    empty is blank; one starting with "#" is a comment ("# language:" lines are
    plain comments). Both are ignored. A "#" later in a line does not start a
    comment, except after tags. Keywords are recognised only with exactly the
    capitalisation and colon shown in this spec, at the start of the trimmed
    line. Names after "Feature:", "Scenario:" and "Example:" are the rest of
    the line, trimmed, and may be empty.

    @happy
    Scenario: Names are trimmed and may be empty
      Given the feature text is the JavaScript string "  Feature:   Checkout # v2  \n\tScenario:Pay\t\n  Example:\n"
      When parseFeature is called
      Then the feature name is "Checkout # v2"
      And the scenarios are:
        | name | line | tags |
        | Pay  | 2    |      |
        |      | 3    |      |

  Rule: The file starts with exactly one "Feature:" line, and text before the first section is an ignored description
    Before the "Feature:" line only blank and comment lines may appear;
    otherwise, including for tag lines, the error is at the first other line
    with reason 'expected "Feature:"'. A file with no "Feature:" line and no
    other content (empty, blank or comments only) fails at line 1 with the same
    reason. Any later "Feature:" line, wherever it is outside a doc string,
    fails with 'second "Feature:"'. Between the "Feature:" line and the first
    "Background:", "Scenario:", "Example:", "Rule:" or tag line, any line is
    description text and is ignored, except that a step line there fails (see
    the steps rule) and keyword lines named as errors in this spec still fail.

    @boundary
    Scenario: Description text is ignored, even when it looks like a table or doc string
      Given the feature text:
        """
        Feature: F
          As a user
          | not a table |
          \"\"\"
          Examples: not special here
          Given-ish text is fine

          Scenario: S
        """
      When parseFeature is called
      Then the scenarios are:
        | name | line | tags |
        | S    | 8    |      |

    @unhappy
    Scenario: Missing, late or repeated Feature line
      When parseFeature is called with each text
      Then a ParseError is thrown for each:
        | text                                | line | message                       |
        | ""                                  | 1    | line 1: expected "Feature:"   |
        | "\n  \n# only a comment\n"          | 1    | line 1: expected "Feature:"   |
        | "Scenario: S\nFeature: F\n"         | 1    | line 1: expected "Feature:"   |
        | "# c\n\nhello\nFeature: F\n"        | 3    | line 3: expected "Feature:"   |
        | "@tag\nFeature: F\n"                | 1    | line 1: expected "Feature:"   |
        | "feature: F\n"                      | 1    | line 1: expected "Feature:"   |
        | "Feature: A\nFeature: B\n"          | 2    | line 2: second "Feature:"     |
        | "Feature: A\nScenario: S\nGiven x\n  Feature: B\n" | 4 | line 4: second "Feature:" |

  Rule: An optional Background comes before any Rule or Scenario and appears at most once
    "Background:" starts the background; any text after its colon is ignored.
    Its steps go in background, which is null when there is no
    "Background:" line and [] when it has no steps. A "Background:" line after
    an earlier "Background:" fails with 'second "Background:"'. Otherwise one
    after any "Scenario:", "Example:" or "Rule:" line fails with
    '"Background:" must come before any "Rule:" or "Scenario:"'. Tags before a
    "Background:" fail (see the tags rule).

    @unhappy
    Scenario: Misplaced and repeated backgrounds
      When parseFeature is called with each text
      Then a ParseError is thrown for each:
        | text                                                 | line | message                                                            |
        | "Feature: F\nScenario: S\nBackground:\n"             | 3    | line 3: "Background:" must come before any "Rule:" or "Scenario:" |
        | "Feature: F\nRule: R\nBackground:\n"                 | 3    | line 3: "Background:" must come before any "Rule:" or "Scenario:" |
        | "Feature: F\nBackground:\nGiven x\nBackground:\n"    | 4    | line 4: second "Background:"                                       |
        | "Feature: F\nBackground:\nScenario: S\nBackground:\n" | 4   | line 4: second "Background:"                                       |

  Rule: "Scenario:" and "Example:" start a scenario; Scenario Outlines are rejected
    "Example:" is a synonym for "Scenario:"; the scenario's line is the line of
    whichever was used. A trimmed line starting with "Scenario Outline:" or
    "Scenario Template:" fails with '"Scenario Outline:" is not supported' or
    '"Scenario Template:" is not supported' respectively, wherever it appears
    after the "Feature:" line outside a doc string. "Examples:" and
    "Scenarios:" have no meaning, so inside a scenario they are unexpected
    lines.

    @happy
    Scenario: Example is a synonym of Scenario
      Given the feature text is the JavaScript string "Feature: F\nExample: E\n  Given x\nScenario: S\n"
      When parseFeature is called
      Then the scenarios are:
        | name | line | tags |
        | E    | 2    |      |
        | S    | 4    |      |

    @unhappy
    Scenario: Outlines and templates are not supported
      When parseFeature is called with each text
      Then a ParseError is thrown for each:
        | text                                                    | line | message                                        |
        | "Feature: F\nScenario Outline: O\n  Given <x>\n"        | 2    | line 2: "Scenario Outline:" is not supported  |
        | "Feature: F\nScenario: S\nGiven x\n  Scenario Template: T\n" | 4 | line 4: "Scenario Template:" is not supported |
        | "Feature: F\nScenario: S\n  Given x\n  Examples:\n"     | 4    | line 4: unexpected line "Examples:"            |

  Rule: "Rule:" lines group scenarios but do not appear in the result
    A "Rule:" line may appear after the Background and between scenarios; text
    after its colon is ignored. Scenarios under rules are returned in
    scenarios in file order, as if the "Rule:" lines were absent. Between a
    "Rule:" line and the next "Scenario:", "Example:", "Rule:" or tag line, any
    line is ignored description text, as under the "Feature:" line, and a step
    line there fails the same way.

    @happy
    Scenario: Scenarios under rules are flattened in file order
      Given the feature text:
        """
        Feature: F

          Background:
            Given shared

          Scenario: Before rules
            Given a

          Rule: First rule
            Free text describing the rule.
            | ignored | too |

            Scenario: In first rule
              Given b

          Rule: Second rule

            Example: In second rule
              Given c
        """
      When parseFeature is called
      Then the background has the steps:
        | keyword | text   | line |
        | Given   | shared | 4    |
      And the scenarios are:
        | name           | line | tags |
        | Before rules   | 6    |      |
        | In first rule  | 13   |      |
        | In second rule | 18   |      |
      And scenario "In first rule" has the steps:
        | keyword | text | line |
        | Given   | b    | 14   |

  Rule: A step is a keyword, one space and text, inside a Background or Scenario
    A step line's trimmed text starts with "Given", "When", "Then", "And",
    "But" or "*" followed by one space and at least one more character. The
    keyword is returned as written; text is everything after that one space up
    to the end of the trimmed line, so extra spaces after the keyword are kept
    and "#" is part of the text. No check is made of keyword order (a scenario
    may start with "And"). A line that is not of this form (wrong case, a colon
    or tab after the keyword, no space, or nothing after the keyword) is not a
    step. A step line after the "Feature:" line or a "Rule:" line, before any
    "Background:", "Scenario:" or "Example:" of that section, fails with
    'step outside a "Background:" or "Scenario:"'.

    @happy
    Scenario: Every keyword, extra spaces and hash signs
      Given the feature text:
        """
        Feature: F
          Scenario: S
            Given a
            When b
            Then c
            And d
            But e
            * f
            Given  two spaces
            Then it costs 5 # not a comment
        """
      When parseFeature is called
      Then scenario "S" has the steps:
        | keyword | text                       | line |
        | Given   | a                          | 3    |
        | When    | b                          | 4    |
        | Then    | c                          | 5    |
        | And     | d                          | 6    |
        | But     | e                          | 7    |
        | *       | f                          | 8    |
        | Given   |  two spaces                | 9    |
        | Then    | it costs 5 # not a comment | 10   |
      And the text of the step on line 9 is the JavaScript string " two spaces"

    @unhappy
    Scenario: Steps outside a Background or Scenario
      When parseFeature is called with each text
      Then a ParseError is thrown for each:
        | text                                              | line | message                                              |
        | "Feature: F\nGiven x\n"                           | 2    | line 2: step outside a "Background:" or "Scenario:" |
        | "Feature: F\n  Some description\n  * x\n"         | 3    | line 3: step outside a "Background:" or "Scenario:" |
        | "Feature: F\nScenario: S\nRule: R\nWhen x\n"      | 4    | line 4: step outside a "Background:" or "Scenario:" |

    @unhappy
    Scenario: Lines that look like steps but are not
      When parseFeature is called with each text
      Then a ParseError is thrown for each:
        | text                                   | line | message                             |
        | "Feature: F\nScenario: S\n  given x\n" | 3    | line 3: unexpected line "given x"   |
        | "Feature: F\nScenario: S\n  Given:x\n" | 3    | line 3: unexpected line "Given:x"   |
        | "Feature: F\nScenario: S\n  Given\n"   | 3    | line 3: unexpected line "Given"     |
        | "Feature: F\nScenario: S\n  Given \n"  | 3    | line 3: unexpected line "Given"     |
        | "Feature: F\nScenario: S\n  Andx\n"    | 3    | line 3: unexpected line "Andx"      |

    @unhappy
    Scenario: A tab after the keyword does not make a step
      Given the feature text is the JavaScript string "Feature: F\nScenario: S\n  Given\tx\n"
      When parseFeature is called
      Then a ParseError is thrown with line 3
      And its message is the JavaScript string "line 3: unexpected line \"Given\tx\""

  Rule: Inside a Background or Scenario every line must be a recognised form
    The recognised lines inside a Background or Scenario are blank lines,
    comments, steps, table rows and doc strings belonging to the last step,
    tag lines, and lines starting "Scenario:", "Example:" or "Rule:". The
    lines that fail with their own reasons are listed in the other rules. Any
    other line fails with 'unexpected line "<trimmed line>"'; descriptions
    under a Background or Scenario are therefore not allowed.

    @unhappy
    Scenario: Prose inside a scenario or background
      When parseFeature is called with each text
      Then a ParseError is thrown for each:
        | text                                                | line | message                                 |
        | "Feature: F\nScenario: S\nGiven x\nthis is prose \n" | 4   | line 4: unexpected line "this is prose" |
        | "Feature: F\nScenario: S\n  A description\n"        | 3    | line 3: unexpected line "A description" |
        | "Feature: F\nBackground:\n  prose\n"                | 3    | line 3: unexpected line "prose"         |

  Rule: Tags on the lines before a Scenario belong to that scenario only
    A tag line is a trimmed line starting with "@". It is split on whitespace;
    a token starting with "#" and everything after it is a comment. Every other
    token is a tag and must be "@" followed by at least one character,
    otherwise the line fails with 'invalid tag "<token>"' (the first bad token).
    Tags from consecutive tag lines (blank and comment lines between are
    allowed) are collected in order, duplicates kept, each as written, and
    belong to the next "Scenario:" or "Example:". Tags followed by a "Rule:"
    line are discarded. Tags followed by any other line fail at that line, and
    tags at the end of the file fail at the last tag line, with
    'tags must be followed by "Scenario:" or "Rule:"'. A "Feature:",
    "Scenario Outline:" or "Scenario Template:" line after tags fails with its
    own reason instead. Scenarios do not inherit tags from rules or the
    feature.

    @happy
    Scenario: Tags across several lines, comments, duplicates and rules
      Given the feature text:
        """
        Feature: F

          @a @b
          # between
          @c @a # trailing comment
          Scenario: One
            Given x

          Scenario: Two
            Given y

          @r
          Rule: R

            @d
            Scenario: Three
        """
      When parseFeature is called
      Then the scenarios are:
        | name  | line | tags        |
        | One   | 6    | @a @b @c @a |
        | Two   | 9    |             |
        | Three | 16   | @d          |

    @unhappy
    Scenario: Tags that belong to no scenario, and malformed tags
      When parseFeature is called with each text
      Then a ParseError is thrown for each:
        | text                                            | line | message                                                    |
        | "Feature: F\n@t\nGiven x\n"                     | 3    | line 3: tags must be followed by "Scenario:" or "Rule:"   |
        | "Feature: F\n@t\nBackground:\n"                 | 3    | line 3: tags must be followed by "Scenario:" or "Rule:"   |
        | "Feature: F\nScenario: S\n@t\nsome text\n"      | 4    | line 4: tags must be followed by "Scenario:" or "Rule:"   |
        | "Feature: F\nScenario: S\nGiven x\n@t\n"        | 4    | line 4: tags must be followed by "Scenario:" or "Rule:"   |
        | "Feature: F\n@t\n\n@u\n# c\n"                   | 4    | line 4: tags must be followed by "Scenario:" or "Rule:"   |
        | "Feature: F\n@t\nScenario Outline: O\n"         | 3    | line 3: "Scenario Outline:" is not supported               |
        | "Feature: F\n@smoke fast\nScenario: S\n"        | 2    | line 2: invalid tag "fast"                                 |
        | "Feature: F\n@ @x\nScenario: S\n"               | 2    | line 2: invalid tag "@"                                    |

  Rule: Table rows after a step form that step's data table
    A table row is a trimmed line starting with "|". The row is split at each
    "|" not escaped by a backslash; it must end with such a "|" and have at
    least two of them, otherwise it fails with 'table row must end with "\|"'.
    Each cell's raw text is trimmed, then escapes are decoded left to right:
    backslash-pipe gives "|", two backslashes give one backslash,
    backslash-n gives a newline, and any other backslash is kept as written. Rows belong to the last step of the
    current Background or Scenario; blank and comment lines between the step
    and its rows, or between rows, are ignored. Every row must have as many
    cells as the first row, otherwise it fails with
    'table row has the wrong number of cells: expected <first>, found <this>'.
    A row in a Background or Scenario with no step yet fails with
    'table row must follow a step'; a row after the step's doc string fails
    with 'step already has a doc string'.

    @happy
    Scenario: A table with blank lines, comments and an empty cell
      Given the feature text:
        """
        Feature: F
          Scenario: S
            Given the prices:

              # header next
              |  item  | price |
              | tea    |  2.50 |

              | coffee |       |
            Then done
        """
      When parseFeature is called
      Then the result is:
        """
        { "name": "F", "background": null, "scenarios": [ { "name": "S", "line": 2, "tags": [], "steps": [
          { "keyword": "Given", "text": "the prices:", "line": 3, "docString": null,
            "table": [["item", "price"], ["tea", "2.50"], ["coffee", ""]] },
          { "keyword": "Then", "text": "done", "line": 10, "docString": null, "table": null } ] } ] }
        """

    @boundary
    Scenario: Escapes in cells
      Given the feature text:
        """
        Feature: F
          Scenario: S
            Given cells
              | a \| b | c\\d | e\nf | g\h |
        """
      When parseFeature is called
      Then the table of the step on line 3 is:
        """
        [["a | b", "c\\d", "e\nf", "g\\h"]]
        """

    @unhappy
    Scenario: Malformed and misplaced table rows
      When parseFeature is called with each text
      Then a ParseError is thrown for each:
        | text                                                     | line | message                                                            |
        | "Feature: F\nScenario: S\nGiven x\n\| a \| b \|\n\| c \|\n" | 5 | line 5: table row has the wrong number of cells: expected 2, found 1 |
        | "Feature: F\nScenario: S\nGiven x\n\| a \| b\n"          | 4    | line 4: table row must end with "\|"                               |
        | "Feature: F\nScenario: S\nGiven x\n\|\n"                 | 4    | line 4: table row must end with "\|"                               |
        | "Feature: F\nScenario: S\nGiven x\n\| a \\\|\n"          | 4    | line 4: table row must end with "\|"                               |
        | "Feature: F\nScenario: S\n\| a \|\n"                     | 3    | line 3: table row must follow a step                               |
        | "Feature: F\nBackground:\n\| a \|\n"                     | 3    | line 3: table row must follow a step                               |
        | "Feature: F\nScenario: S\nGiven x\n```\na\n```\n\| a \|\n" | 7  | line 7: step already has a doc string                              |
      And in the fourth row the row's text is "| a \|", whose last "|" is escaped

  Rule: A doc string after a step is kept line by line with the opening indentation removed
    A doc string opens with a trimmed line starting with three double quotes
    or three backticks; any text after them (a media type) is ignored. It
    closes at the next line whose trimmed text is exactly the same delimiter;
    the other delimiter and lines with more text are content. Content lines
    are not trimmed or recognised as anything (comments, keywords and blank
    lines are kept), keep trailing whitespace, and lose only a "\r" before
    "\n". From each, up to N leading whitespace characters are removed, where
    N is the number of characters before the opening delimiter on its line (a
    tab counts as one). Within a content line, the delimiter escaped as
    backslash-quote three times or backslash-backtick three times becomes the
    plain delimiter. An empty doc string is []. The doc string belongs to the
    last step of the current Background or Scenario, and blank and comment
    lines between the step and the opening line are ignored. A doc string with
    no step yet fails with 'doc string must follow a step'; one after the
    step's table fails with 'step already has a table'; a second one fails
    with 'step already has a doc string'. A doc string that is never closed
    fails at its opening line with 'doc string is never closed'. In the
    description text under "Feature:" or "Rule:", delimiter lines are ignored
    text and open nothing.

    @happy
    Scenario: Indentation is removed relative to the opening delimiter
      Given the feature text:
        """
        Feature: F
          Scenario: S
            Given a document
              ```json
              {
                "a": 1
             }

              ```
        """
      When parseFeature is called
      Then the step on line 3 has docString:
        """
        ["{", "  \"a\": 1", "}", ""]
        """
      And its table is null

    @happy
    Scenario: Content is not interpreted
      Given the feature text:
        """
        Feature: F
          Scenario: S
            Given a note
              \"\"\"
              # not a comment
              Scenario: not a scenario
              | not | a table |
              ```
              \"\"\"
            Then done
        """
      When parseFeature is called
      Then the scenarios are:
        | name | line | tags |
        | S    | 2    |      |
      And scenario "S" has the steps:
        | keyword | text   | line |
        | Given   | a note | 3    |
        | Then    | done   | 10   |
      And the step on line 3 has docString:
        """
        ["# not a comment", "Scenario: not a scenario", "| not | a table |", "```"]
        """

    @boundary
    Scenario: Doc string edge cases
      When parseFeature is called with each text
      Then the step on line 3 has the docString:
        | text                                                                          | docString             |
        | "Feature: F\nScenario: S\nGiven x\n```\n```\n"                               | []                    |
        | "Feature: F\r\nScenario: S\r\nGiven x\r\n    \"\"\"\r\n    a  \r\n    \"\"\"\r\n" | ["a  "]          |
        | "Feature: F\nScenario: S\nGiven x\n\t```\n\t\tdeep\n  two\n\t```\n"          | ["\tdeep", " two"]    |
        | "Feature: F\nScenario: S\nGiven x\n\n# c\n```\na\n```\n"                     | ["a"]                 |
        | "Feature: F\nScenario: S\nGiven x\n```\na \\`\\`\\` b\n```\n"                | ["a ``` b"]           |
        | "Feature: F\nScenario: S\nGiven x\n\"\"\"\nsay \\\"\\\"\\\"\n\"\"\"\n"      | ["say \"\"\""]        |
        | "Feature: F\nScenario: S\nGiven x\n```\n``` x\n```\n"                        | ["``` x"]             |

    @unhappy
    Scenario: Unclosed, misplaced and repeated doc strings
      When parseFeature is called with each text
      Then a ParseError is thrown for each:
        | text                                                              | line | message                                 |
        | "Feature: F\nScenario: S\nGiven x\n```\nnever closed\n"           | 4    | line 4: doc string is never closed      |
        | "Feature: F\nScenario: S\nGiven x\n\"\"\"\na\n```\n"              | 4    | line 4: doc string is never closed      |
        | "Feature: F\nScenario: S\n```\nx\n```\n"                          | 3    | line 3: doc string must follow a step   |
        | "Feature: F\nScenario: S\nGiven x\n```\na\n```\n```\nb\n```\n"    | 7    | line 7: step already has a doc string   |
        | "Feature: F\nScenario: S\nGiven x\n\| a \|\n```\nb\n```\n"        | 5    | line 5: step already has a table        |

  Rule: ParseError carries the line, and its message starts with "line <n>: "
    new ParseError(reason, line) sets line to the given number, name to
    "ParseError" and message to "line <line>: <reason>"; it is an instance of
    ParseError and of Error. parseFeature reads the file from top to bottom and
    throws for the first offending line in file order, with the reasons
    exactly as given in this spec. No other errors are thrown for string
    input.

    @happy
    Scenario: Constructing a ParseError
      When new ParseError("bad indent", 7) is created
      Then its line is 7
      And its message is "line 7: bad indent"
      And its name is "ParseError"
      And it is an instance of ParseError and of Error

    @unhappy
    Scenario: The first error in the file is reported
      Given the feature text is the JavaScript string "Feature: F\nGiven x\nScenario Outline: O\nFeature: G\n"
      When parseFeature is called
      Then a ParseError is thrown with line 2
      And its message is exactly: line 2: step outside a "Background:" or "Scenario:"

  Rule: parseFeature is a pure function of its text
    It keeps no state between calls, never modifies its input and returns new
    objects and arrays on every call. A non-string argument throws a TypeError,
    not a ParseError.

    @boundary
    Scenario: Results of separate calls are independent
      Given the feature text is the JavaScript string "Feature: F\nScenario: S\nGiven x\n"
      When parseFeature is called twice on it
      Then the two results are deeply equal
      When the first result's first scenario's steps array is emptied
      Then the second result's first scenario still has 1 step

    @unhappy
    Scenario: Non-string input is a TypeError
      When parseFeature is called with each value
      Then a TypeError is thrown for each:
        | value     |
        | undefined |
        | null      |
        | 42        |
```

Decided:

- Line endings: only `\n` ends a line, a preceding `\r` is dropped, endings may be mixed, lone `\r` is a character, final newline optional, leading BOM removed.
- Line numbering: 1-based, counting blank and comment lines.
- Whitespace: lines are trimmed outside doc strings, so indentation with spaces or tabs is free.
- Comments: a trimmed line starting with `#` is a comment (including `# language:`); `#` later in a line is text, except after tags.
- Keywords: English only, case-sensitive, colon right after the keyword; names are trimmed and may be empty; `Background:`/`Rule:` names are ignored.
- Content before `Feature:`: only blank and comment lines allowed (tags too are rejected); an empty or comment-only file fails at line 1.
- Feature descriptions: any text after `Feature:` or `Rule:` up to the first section is ignored, including `|` and doc-string-delimiter lines; step lines there fail.
- Scenario/Background descriptions: not allowed; any unrecognised line fails as `unexpected line "<text>"`.
- `Example:` is accepted as a synonym of `Scenario:`; `Scenario Template:` is rejected like `Scenario Outline:`; `Examples:` is an unexpected line.
- `Rule:` sections are accepted and flattened into `scenarios` in file order.
- Background placement: at most one, before any `Rule:` or `Scenario:`; an empty Background gives `[]`.
- Step form: keyword plus exactly one space plus non-empty text; extra spaces kept; no keyword-order check; tab or colon after the keyword is not a step.
- Tags: whitespace-separated `@`-tokens with trailing `#` comments; duplicates kept; they belong only to the next scenario; tags before `Rule:` are dropped; tags followed by anything else, or at end of file, fail; malformed tokens fail.
- Table cells: split on unescaped `|`, trimmed, escapes `\|`, `\\`, `\n` decoded; rows must end with `|`; cell counts must match the first row.
- Doc strings: both `"""` and ``` delimiters; media type ignored; exact-delimiter closer; up to N leading whitespace characters removed; escaped delimiters decoded; trailing whitespace kept; empty gives `[]`.
- Step arguments: at most one table or doc string per step; blank and comment lines may separate it from the step.
- Error reporting: the first offending line in file order; exact reason strings; message format `line <n>: <reason>` built by the `ParseError` constructor.
- Purity and input type: no shared state, fresh objects on each call (calls are synchronous, so they cannot overlap); non-string input throws `TypeError`.
