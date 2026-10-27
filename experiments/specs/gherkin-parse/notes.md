## Notes

### Result shape

- `parseFeature` returns plain objects with exactly the documented fields and no others. A feature has `name`, `background` and `scenarios`. A scenario has `name`, `line`, `tags` and `steps`. A step has `keyword`, `text`, `line`, `docString` and `table`. The whole result is compared by deep strict equality.
- A step with no doc string has `docString: null`, and a step with no table has `table: null`.
- A scenario with no tags has `tags: []`.

### Feature line and file layout

- The feature name is the text after `Feature: `. For example, `Feature: Payouts` gives `"Payouts"`.
- A file holding only `"Feature: Empty\n"` gives `{ name: "Empty", background: null, scenarios: [] }`.
- `"Feature: Empty"` with no final newline gives the same result.
- Lines can end with `\n` or `\r\n`. A `\r` never appears in names, step texts or doc string lines.
- Line numbers count from 1 and include blank lines. This holds for both line-ending styles.
- Free-text description lines after the `Feature:` line and before the first `Background:` or `Scenario:` are skipped. Examples are `  Payouts move money out of an account.` and `  They run nightly.`.
- The following is valid and gives an empty feature named `"Empty"`: `Feature: Empty`, then the description `  Nothing to see here.`, a blank line, `  # just a comment`, and a trailing empty line, all joined with `\r\n`.
- Leading indentation can be spaces, tabs or a mix of both. Examples are `\tScenario: …`, `\t\tGiven …` and ` \t * a starred step`.

### Scenarios

- Scenarios are returned in file order. Each one has its name and the line number of its `Scenario:` line.
- In this file, `Scenario: First payout` on line 3 and `Scenario: Second payout` on line 8 give `{ name: "First payout", line: 3, … }` and `{ name: "Second payout", line: 8, … }`:

  ```
  Feature: Payouts
  (blank)
    Scenario: First payout
      Given an account with 100
      When a payout of 40 runs
      Then the balance is 60
  (blank)
    Scenario: Second payout
      Given a frozen account
      And a payout request
      But no funds
      * nothing is paid
  ```

- The scenario name is everything after the first `Scenario: `, and later colons stay in the name. For example, `\tScenario: Tabbed: with a colon` gives the name `"Tabbed: with a colon"`.

### Steps

- A step line starts, after indentation, with one of `Given`, `When`, `Then`, `And`, `But` or `*`. The keyword is recorded as written.
- In the scenarios example above, the steps are:
  - line 4: `Given` / `"an account with 100"`
  - line 5: `When` / `"a payout of 40 runs"`
  - line 6: `Then` / `"the balance is 60"`
  - line 9: `Given` / `"a frozen account"`
  - line 10: `And` / `"a payout request"`
  - line 11: `But` / `"no funds"`
  - line 12: `*` / `"nothing is paid"`
- A step's text is what follows the keyword and exactly one space. Any extra spaces are kept. For example, `    Given  two spaces after the keyword` gives the text `" two spaces after the keyword"`.
- Step text can contain keyword-like content. For example, `\t\tGiven the "Scenario:" label` gives `Given` with the text `the "Scenario:" label`.
- ` \t * a starred step` gives keyword `*` with the text `"a starred step"`.
- Steps belong to the most recent `Scenario:` (or `Background:`) and keep their file order.
- Blank lines and comment lines between steps are skipped. For example, under `Scenario: Tagged` on line 7, a comment on line 8, `Given a step` on line 9, a blank line 10 and `Then another step` on line 11 give two steps, on lines 9 and 11.

### Comments

- A line whose first non-indent character is `#` is a comment and is ignored anywhere outside a doc string. This holds before tags, between tag lines, between steps and after the last step of a scenario.
- A comment that looks like a keyword, tag or step is still just a comment. Examples are `    # Scenario: not a scenario`, `    # Given not a step` and `    #@not-a-tag`. These add no scenario, no step and no tag.

### Tags

- A tag line holds whitespace-separated tags, each kept as written. Tags go to the next scenario.
- For example, `  @happy @smoke` right before `Scenario: Tagged` gives `tags: ["@happy", "@smoke"]`, in that order.
- Tags apply only to the next scenario. A later scenario with no tag lines of its own gets `[]`.
- Tags from several tag lines before one scenario are all collected, and comment lines between them are allowed. For example, `  @a @b`, then `  # between tag lines`, then `  @c`, then `  Scenario: Second` gives that scenario the tags `@a`, `@b` and `@c`. Only the set of tags is checked here, not their order.
- In that same file, the scenario before the tag lines keeps `tags: []`.

### Background

- `Background:` steps go into `feature.background` and are not copied into any scenario.
- For example, take `Background:` on line 3, then `Given a ledger` (line 4) and `And a fixed clock` (line 5). This gives `background` = [`Given`/`"a ledger"`/line 4, `And`/`"a fixed clock"`/line 5]. The scenarios `One` (line 7) and `Two` (line 10) each hold only their own single step (lines 8 and 11).
- If there is no `Background:` line, `background` is `null`.
- A `Background:` with no steps, immediately followed by a `Scenario:`, gives `background: []` (not `null`).

### Doc strings

- A doc string is a block that opens and closes with a `"""` line, after a step. Its lines become that step's `docString`, an array of strings.
- The indentation of the opening `"""` is removed from each content line, and any deeper indentation is kept. For example, with the `"""` lines indented 6 spaces and the content `      {`, `        "amount": 10`, `      }`, the result is `["{", "  \"amount\": 10", "}"]`.
- Doc string lines count toward line numbers. In that example, the step after the doc string is on line 9: `Given a payload` is on line 3 and its doc string covers lines 4–8.
- The content of a doc string is taken literally and never read as structure. With 4-space indentation and `\r\n` line endings, these lines are kept as written in `docString`, with no `\r`: `Feature: not a second feature`, `Scenario: not a scenario`, `Scenario Outline: not an outline`, `Background: not a background`, `Given not a step`, `# not a comment`, `@not-a-tag` and `| not | a table |`.
- In that same file, the result has `background: null`, exactly 1 scenario and exactly 2 steps. The first step has `table: null`. The step after the closing `"""` is `Then` / `"it is kept as written"` / line 14.

### Tables

- Lines starting with `|` (after indentation) that follow a step become that step's `table`. Each line is one row, and each cell is trimmed.
- For example, `      | name  | amount |` and `      |  Ada  |   10   |` under `Then the rows are` give `[["name", "amount"], ["Ada", "10"]]`.
- A step line after a table is a normal new step. For example, `And a plain step` on line 12 gives a step with no doc string and no table.

### Errors

- Every invalid file throws an instance of `ParseError`.
- The error's `line` is the 1-based line where the file goes wrong.
- The error's `message` contains `line <n>` for that same number, with no further digit right after it. For example, `line 4` but not `line 40`.
- Content before any `Feature:` line fails at the first such line. Blank lines before it are fine.
  - Example: blank, blank, `Scenario: Orphan`, `  Given a step`, `Feature: Late` fails at line 3.
- A second `Feature:` line fails at that line.
  - Example: `Feature: Payouts`, `  Scenario: One`, `    Given a step`, `Feature: Refunds`, … fails at line 4.
- The second-`Feature:` rule also counts blank lines and `\r\n` endings correctly.
  - Example: `Feature: Payouts`, blank, `  Scenario: One`, blank, `    Given a step`, blank, `Feature: Refunds`, joined with `\r\n`, fails at line 7.
- A step before any `Background:` or `Scenario:` fails at the step's line, even when a tag line comes first.
  - Example: `Feature: Payouts`, `  @tagged`, `  Given a step with no scenario`, `  Scenario: One`, … fails at line 3.
- A line inside a scenario that is none of the recognised forms fails at that line.
  - Example: under `Scenario: One` (line 2), `Given a step` (line 3) followed by `    this line is not a step` fails at line 4.
- A doc string that is never closed fails at the line of its opening `"""`. Everything after that line counts as doc string content, including step-like lines.
  - Example: `Feature: Payouts`, `  Scenario: One`, `    Given a document`, `      """`, `      some text`, `    Then another step`, then a trailing empty line, fails at line 4.
- `Scenario Outline:` fails at its own line, and the message contains the word "support" (case-insensitive), saying it is not supported.
  - Example: `Feature: Payouts`, `  Scenario: One`, `    Given a step`, blank, `  Scenario Outline: Many`, … fails at line 5.
