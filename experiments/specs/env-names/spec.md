# Map environment variable names through the name table

Environment variable names such as `NORTHWIND_SMTP_HOST` pass into the public
copy of a codebase unchanged and say whose code it is. When the public copy
is built, they are renamed through the name table, in `.env` files and in
code, and renaming back restores the originals.

```gherkin
Feature: Rename environment variable names in a set of files

  Background:
    Given a name table of environment variable names, each with a real name and a public name
    And a set of files, each with a path and text
    And mapping "to public" replaces real names with public ones, and "to real" the reverse

  @happy
  Scenario: Names are mapped in .env files
    Given the table maps real "NORTHWIND_SMTP_HOST" to public "SVC_A_HOST"
    And a file ".env.example" with the text
      """
      # mail
      NORTHWIND_SMTP_HOST=localhost
      export NORTHWIND_SMTP_HOST=localhost
      """
    When the files are mapped to public
    Then the text is
      """
      # mail
      SVC_A_HOST=localhost
      export SVC_A_HOST=localhost
      """
    And a file counts as a .env file when its name is ".env" or starts with ".env."
    And in a .env file only the name before "=" is renamed: comments and values are left as they are

  @happy
  Scenario: Names are mapped where code reads them
    Given the same table
    And a file "src/mail.ts" with the text
      """
      const host = process.env.NORTHWIND_SMTP_HOST;
      const again = process.env["NORTHWIND_SMTP_HOST"] ?? process.env['NORTHWIND_SMTP_HOST'];
      // NORTHWIND_SMTP_HOST is documented elsewhere
      """
    When the files are mapped to public
    Then the three process.env reads name "SVC_A_HOST"
    And the comment is left as it is, since it is not a read of process.env

  @happy
  Scenario: Names are consistent across all files
    Given the table maps two real names
    When files of every kind that use both names are mapped to public
    Then each real name becomes the same public name in every file

  @happy
  Scenario: Mapping back restores the original names
    Given any files and table
    When the files are mapped to public and the result is mapped to real
    Then every file's text is exactly what it was

  @boundary
  Scenario: A name that is the start of another name is matched whole
    Given the table maps "NORTHWIND_SMTP" to "SVC_A" and "NORTHWIND_SMTP_HOST" to "SVC_A_HOST"
    When a file reading process.env.NORTHWIND_SMTP and process.env.NORTHWIND_SMTP_HOST is mapped to public
    Then they become process.env.SVC_A and process.env.SVC_A_HOST

  @boundary
  Scenario: Names missing from the table are reported
    Given the table does not have "NORTHWIND_API_KEY"
    When a file assigning or reading NORTHWIND_API_KEY is mapped to public
    Then it is left as it is
    And the result lists "NORTHWIND_API_KEY" among the unmapped names, once, sorted alphabetically with the others

  @unhappy
  Scenario: A table that maps two names to one is refused
    Given the table maps "NORTHWIND_A" and "NORTHWIND_B" both to public "SVC_X"
    When any files are mapped
    Then it fails with an error naming "SVC_X"
```
