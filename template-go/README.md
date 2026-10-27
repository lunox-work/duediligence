# Go task template

The `go` toolchain: Go from PATH (1.22 or later), the standard library
only, no network. `go.mod` names the module `task`; `sandbox/` is the
harness and is never part of a submission.

- `src/task.go` (`package task`) is the interface both suites import, as
  `task "task/src"`.
- `tests/public/*_test.go` is the public suite; `tests/private/` the hidden
  one, present only where the grader stages it; `tests/own/` the agent's.
- `sh sandbox/test.sh public` runs a suite; `go vet ./...` checks
  everything compiles.
- A test function named `Test_<kind>_<n>__...` is keyed to that spec
  scenario. The grader (`bin/runners/go-test.mjs`) runs each top-level test
  in its own process, so one panic fails one test.
