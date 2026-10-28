# Apply a contributor's patch

A contributor's work arrives as a unified diff made against the version
they were given. Before it is judged, it is applied to that version's
files. A patch either applies whole or not at all, and when it does not,
the contributor is told every hunk that failed and why.

```gherkin
Feature: Apply a unified diff to a set of files

  Background:
    Given a set of files, each a path and its text
    And a unified diff in git's format: for each file a "diff --git" line, optional "new file mode", "deleted file mode", "rename from" and "rename to" lines, then, when the file has hunks, "---" and "+++" headers with "a/" and "b/" prefixes or "/dev/null" and its hunks; git leaves both headers out for a new or deleted empty file and for a rename with no hunks
    And each hunk starts "@@ -oldStart,oldCount +newStart,newCount @@" where a missing count means 1
    And applying returns either the new set of files, or the list of rejected hunks with the original files untouched

  Rule: Hunks apply where their lines match

    @happy
    Scenario: A hunk applies at its stated line
      Given a file whose lines match a hunk's context and removed lines at its old start line
      When the diff is applied
      Then the removed lines are replaced by the added lines there
      And the result reports an offset of 0 for that hunk

    @boundary
    Scenario: A hunk whose lines moved applies at the nearest match
      Given a file where a hunk's context and removed lines match only some lines away from its old start line
      When the diff is applied
      Then the hunk applies at the matching position nearest to the stated line
      And of two positions equally near, the earlier one is used
      And the result reports the offset, positive when later in the file and negative when earlier
      And every context line must match: there is no fuzz

    @happy
    Scenario: Several hunks in one file apply in order
      Given a diff with several hunks for one file
      When the diff is applied
      Then each hunk is located in the file as already changed by the hunks before it
      And a hunk's stated line is its old start line moved by the lines the hunks before it added or removed, and its offset is measured from that line
      And a later hunk is never placed before the end of the hunk before it

  Rule: Files are created, deleted and renamed

    @happy
    Scenario: A new file is created
      Given a diff whose "---" header is "/dev/null"
      When the diff is applied
      Then the file is created with the hunk's added lines, or empty when it has no hunks
      And it is rejected with reason "exists" if a file is already at that path

    @happy
    Scenario: A file is deleted
      Given a diff whose "+++" header is "/dev/null"
      When the diff is applied
      Then the file is removed
      And it is rejected with reason "no match" unless the hunk's removed lines are the file's whole text, or the file is empty when it has no hunks

    @happy
    Scenario: A file is renamed
      Given a diff with "rename from old/a.ts" and "rename to new/a.ts"
      When the diff is applied
      Then the file is at "new/a.ts" and not at "old/a.ts"
      And any hunks for it apply to its text as they would without the rename
      And a rename with no hunks moves the text unchanged

  Rule: Line endings and final newlines are kept

    @boundary
    Scenario: A file's line endings are kept
      Given a file whose lines end with "\r\n"
      When a diff whose lines end with "\n" is applied to it
      Then lines match whatever their ending, and every line the hunk adds ends with "\r\n"
      And a file takes the ending of its first line, or "\n" when it has none

    @boundary
    Scenario: A missing final newline is honoured
      Given a hunk where "\ No newline at end of file" follows a removed or context line
      Then that old line is the last in the file and has no newline
      And where the marker follows an added line, the new last line has no newline
      And where no marker follows the last added or context line, the new file ends with a newline

  Rule: A patch applies whole or not at all

    @unhappy
    Scenario: Every failing hunk is reported and nothing changes
      Given a diff where the second hunk of one file and the first hunk of another do not match
      When the diff is applied
      Then the result is a rejection listing both, each with its path, its hunk number counting from 1 within its file, and reason "no match"
      And no file in the result differs from the input, including the files whose hunks did apply

    @unhappy
    Scenario: A missing file is rejected
      Given a diff that changes a path not in the set of files
      When the diff is applied
      Then its hunks are rejected with reason "missing"

    @unhappy
    Scenario: A malformed diff is refused outright
      Given a diff whose hunk has fewer lines than its header counts, or a hunk before any file header
      When the diff is applied
      Then it fails with an error, rather than returning a rejection
```

## Interface: a command

The code is checked only through one command, run from the project's root:
`.bin/task <name>`, where `<name>` is one of `applyPatch`.
It reads a JSON array of the arguments on stdin and writes the JSON of the
result on stdout, exit 0. Where the spec says a call fails with an error, it
writes the error's message, and nothing else, on stderr and exits 1. `tests/public/boundary.ts` describes
each name's arguments and result as TypeScript types; the tests call the
command, never the module. A value the spec writes as `undefined` is no
output at all.
