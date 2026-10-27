# Gherkin parser returning scenarios and steps

Context
Spec generation and mutation reports both need to read .feature files.

Change
Parse a .feature file to return scenarios with their steps and line numbers, and raise a clear error on invalid files.

Acceptance criteria

- Valid files return scenarios in order
- Invalid files report the line of the error

Scope
The parser in `src/index.ts`. There is no Gherkin package to wrap: write the parser.
