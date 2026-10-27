# Pin the toolchain with a .tool-versions file

Sandboxes built on different machines pick up different Node, Python and Go
versions, which breaks reproducibility. When a sandbox is generated, the
versions the source repository declares are written to `.tool-versions` in
the sandbox root. A version the repository does not state exactly is left
out: a wrong pin is worse than none.

```gherkin
Feature: Detect the toolchain a repository declares

  Background:
    Given a set of files from a repository's root, each a path and its text
    And only files at the root are read: a path containing "/" is ignored
    And an exact version is one to three whole numbers joined by ".", such as "22", "22.12" or "22.12.0"
    And anything else is not a version: a range such as ">=22" or "^3.11", an alias such as "lts/*", "lts/iron", "latest", "stable", "node" or "system", or an empty value
    And a source that holds no exact version is skipped, and the next source for that tool is tried

  Rule: Each tool has its sources, tried in order

    @happy
    Scenario: Node comes from .nvmrc, then .node-version, then package.json
      Given the sources for nodejs, in order: ".nvmrc", ".node-version", the "volta.node" field of "package.json", then its "engines.node" field
      When the root holds ".nvmrc" with "22.12.0"
      Then nodejs is pinned to "22.12.0"
      And in ".nvmrc" and ".node-version" alone, one leading "v" is dropped, so "v20.11.1" is "20.11.1"

    @happy
    Scenario: Python comes from .python-version, then runtime.txt, then pyproject.toml
      Given the sources for python, in order: ".python-version", "runtime.txt" written as "python-3.11.4", then a line such as requires-python = "==3.12.1" in "pyproject.toml", its value in double or single quotes
      When the root holds "runtime.txt" with "python-3.11.4"
      Then python is pinned to "3.11.4"
      And in "pyproject.toml" only a value of "==" followed by an exact version counts; ">=3.12" or "~=3.12" is not a version

    @happy
    Scenario: Go comes from the toolchain line of go.mod, then its go line
      Given a "go.mod" holding "go 1.22" and "toolchain go1.22.3"
      Then golang is pinned to "1.22.3"
      And without a toolchain line, golang is pinned to the go line's version, "1.22"

    @boundary
    Scenario: A source that names no exact version does not stop the search
      Given ".nvmrc" holds "lts/iron" and "package.json" has "engines.node" of "22.12.0"
      Then nodejs is pinned to "22.12.0"

    @unhappy
    Scenario: A tool no source states exactly is left out
      Given ".nvmrc" holds "lts/*" and "package.json" has "engines.node" of ">=20"
      Then nodejs is not in the result at all
      And no version is guessed, rounded or taken from part of a range

  Rule: Files are read carefully

    @boundary
    Scenario: Version files are read line by line
      When ".nvmrc", ".node-version" or ".python-version" is read
      Then its first line that is not empty and does not start with "#" is the value
      And spaces, tabs and a trailing "\r" around it are not part of it
      And a value with anything after the version on the same line, such as "3.12.1 3.11.8", is not a version

    @unhappy
    Scenario: A file that cannot be read as its format is skipped
      Given "package.json" is not valid JSON
      Then it is skipped as a source, and the other sources are still tried
      And the result notes "package.json" among the unreadable files

  Rule: The file says what was chosen

    @boundary
    Scenario: The first source wins and a disagreement is reported
      Given ".nvmrc" holds "22.12.0" and "package.json" has "engines.node" of "20.11.1"
      Then nodejs is pinned to "22.12.0"
      And the result reports a conflict for nodejs: chosen "22.12.0" from ".nvmrc", ignored "20.11.1" from "package.json"
      And sources that hold no exact version are never part of a conflict

    @happy
    Scenario: The file lists each pinned tool on its own line
      Given nodejs, python and golang are all pinned
      Then the file's text is the lines "nodejs <version>", "python <version>" and "golang <version>", in that order, each ending with "\n"
      And a tool that is not pinned has no line

    @boundary
    Scenario: Nothing pinned means no file
      Given no tool is pinned
      Then the result has no file text at all, rather than an empty file
```
