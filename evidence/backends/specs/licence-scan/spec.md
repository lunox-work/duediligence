# Licence scan in the automated tier

The beta terms forbid copyleft code in submissions. A submission's lockfile
is compared with the version's own, and the submission fails when it adds a
dependency under the GPL or AGPL, or one whose licence cannot be told.

```gherkin
Feature: Scan the dependencies a submission adds

  Background:
    Given the version's "package-lock.json" text and the submission's, both npm lockfile version 3
    And a lockfile's "packages" object maps paths such as "node_modules/@scope/name" or "node_modules/a/node_modules/b" to entries with "version", optional "license" and optional "dev"
    And a package's name is its path after the last "node_modules/", so "node_modules/a/node_modules/@s/b" is "@s/b"
    And the entry under the empty path "" is the project itself and is never scanned

  Rule: Only what the submission adds is scanned

    @happy
    Scenario: A dependency the version already had is not scanned
      Given a package with the same name and version in both lockfiles
      Then it is not scanned, whatever its licence

    @boundary
    Scenario: A new version of a dependency counts as added
      Given the version has "left-pad" 1.3.0 and the submission has "left-pad" 2.0.0
      Then "left-pad" 2.0.0 is scanned
      And a name and version pair already in the version's lockfile under any path is not scanned again

    @boundary
    Scenario: Development dependencies are not scanned
      Given an added entry with "dev" true
      Then it is not scanned

  Rule: Licences are read as SPDX expressions

    @happy
    Scenario: A permissive licence passes
      Given an added package with licence "MIT", "Apache-2.0", "BSD-3-Clause", "ISC" or "LGPL-3.0-only"
      Then it passes
      And the LGPL is not the GPL: any identifier starting "LGPL" passes

    @unhappy
    Scenario: A GPL or AGPL licence fails
      Given an added package with licence "GPL-3.0-only", "GPL-2.0-or-later", "AGPL-3.0", "GPL-2.0+" or "gpl-3.0"
      Then it fails as "copyleft"
      And an identifier is copyleft when, ignoring case, it starts with "GPL" or "AGPL", so "GPLv3" is copyleft too

    @boundary
    Scenario: An exception does not change the licence
      Given an added package with licence "GPL-2.0-only WITH Classpath-exception-2.0"
      Then it fails as "copyleft"

    @boundary
    Scenario: OR offers a choice and AND requires both
      Given SPDX precedence, where WITH binds tightest, then AND, then OR, and parentheses group
      Then "MIT OR GPL-3.0-only" passes, because one alternative is permitted
      And "MIT AND GPL-3.0-only" fails as "copyleft"
      And "(MIT OR GPL-3.0-only) AND AGPL-3.0" fails as "copyleft"
      And "MIT OR GPL-3.0-only AND Apache-2.0" passes, because it reads as MIT OR (GPL-3.0-only AND Apache-2.0)

    @unhappy
    Scenario: A licence that cannot be told fails
      Given an added package with no "license", an empty one, "UNLICENSED", "SEE LICENSE IN LICENSE.md", a "LicenseRef-" identifier, or an expression that does not parse
      Then it fails as "unknown"
      And an old-style "license" object is read from its "type" field, and an old-style "licenses" array as each entry's "type" joined by OR

  Rule: The result names every offender

    @happy
    Scenario: The result lists offenders in order
      When the scan finishes
      Then it passes when nothing fails, and otherwise lists each failing package with its name, version, licence as written, and reason "copyleft" or "unknown"
      And each name and version pair is listed once, ordered by name, then version

    @unhappy
    Scenario: A lockfile that cannot be read is refused
      Given either text is not JSON, or has no "packages" object, or has a "lockfileVersion" other than 3
      Then the scan fails with an error, rather than returning a result
```
