# Reverse-map a unified diff

Contributors work on a copy of the code where file paths and identifiers
have been renamed through a name table. To merge their patch back, it has to
be turned into real names again, file paths included.

```gherkin
Feature: Reverse-map a unified diff through the name table

  Background:
    Given a name table whose entries each have a kind, a real name and a public name
    And kind "path" entries rename a file or directory path
    And kind "identifier" entries rename a word in code
    And reverse-mapping replaces public names with real ones

  @happy
  Scenario: File headers are mapped
    Given the table has path entry real "billing/invoice.ts" public "ledger/sheet.ts"
    And a diff whose headers are
      """
      diff --git a/ledger/sheet.ts b/ledger/sheet.ts
      --- a/ledger/sheet.ts
      +++ b/ledger/sheet.ts
      """
    When the diff is reverse-mapped
    Then every "ledger/sheet.ts" in those header lines becomes "billing/invoice.ts"

  @happy
  Scenario: A directory entry maps every path under it
    Given the table has path entry real "billing" public "ledger"
    When a diff touching "ledger/a/b.ts" is reverse-mapped
    Then its headers name "billing/a/b.ts"
    And a path entry matches whole path segments only, so "ledgers/x.ts" is not mapped by it

  @happy
  Scenario: Hunk content is mapped word by word
    Given the table has identifier entry real "Invoice" public "Sheet"
    And a hunk
      """
      @@ -1,3 +1,3 @@ class Sheet {
       const a = new Sheet();
      -a.total(Sheet.empty);
      +a.total(Sheet.zero, SheetList);
      """
    When the diff is reverse-mapped
    Then every whole-word "Sheet" in the context, removed and added lines and in the text after the second "@@" becomes "Invoice"
    And "SheetList" is left as it is, because it is a different word
    And the "@@ -1,3 +1,3 @@" line numbers are unchanged

  @boundary
  Scenario: Renames and new or deleted files are mapped too
    Given the table has path entry real "billing" public "ledger"
    When a diff with "rename from ledger/a.ts", "rename to ledger/b.ts" and a "--- /dev/null" header is reverse-mapped
    Then the rename lines name "billing/a.ts" and "billing/b.ts"
    And "/dev/null" is left as it is

  @boundary
  Scenario: The most specific path entry wins
    Given path entries real "billing" public "ledger" and real "payments/core.ts" public "ledger/core.ts"
    When a diff touching "ledger/core.ts" is reverse-mapped
    Then its headers name "payments/core.ts"

  @boundary
  Scenario: Names are replaced in one pass
    Given identifier entries real "Alpha" public "Beta" and real "Beta" public "Gamma"
    When a hunk line "+Beta(Gamma)" is reverse-mapped
    Then it becomes "+Alpha(Beta)"

  @boundary
  Scenario: Everything else is unchanged byte for byte
    When any diff is reverse-mapped
    Then lines that hold no public name are unchanged
    And "\ No newline at end of file" markers, line endings and a missing final newline are kept

  @unhappy
  Scenario: Unmapped paths are left untouched and reported
    Given the table has no path entry covering "docs/readme.md"
    When a diff touching "docs/readme.md" is reverse-mapped
    Then its headers still name "docs/readme.md"
    And the result reports "docs/readme.md" as unmapped, once, however many header lines name it
    And unmapped paths are reported in the order they first appear
```
