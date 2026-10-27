Implement the specification in `spec.md`.

- The interface is drafted in `src/task.go`, with bodies that
  `panic("not implemented")`. Keep its exported names and signatures.
- The task's code lives under `src/`, in `package task`. Change it and add
  new files there. The standard library only.
- `sh sandbox/test.sh public` runs the public tests in `tests/public/`.
- Write your own tests under `tests/own/`, as `_test.go` files in
  `package own` that import `task "task/src"`. For each scenario in
  `spec.md`, add at least one case whose inputs differ from every public
  test and from every example the spec writes down: other values, other
  sizes, other orders, other combinations. `sh sandbox/test.sh own` runs
  them.
- Everything else (`tests/public/`, `sandbox/`, `go.mod`) is harness, and a
  submission that changes any of it is rejected.
- Local results help you iterate. Acceptance is decided by a separate run of
  your code against a hidden suite that covers every scenario with inputs
  unlike the public ones; your own tests are not part of it.
- There is no network and nothing to install.

Stop when the public tests and your own all pass. End with a short summary
of what you built.
