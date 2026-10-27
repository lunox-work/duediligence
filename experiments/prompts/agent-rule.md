Implement the specification in `spec.md`.

- The interface is drafted in `src/index.ts`, with bodies that throw
  `not implemented`. Keep its exported names and signatures.
- The task's code lives under `src/`. Change it and add new files there;
  everything else (tests, `sandbox/`, `package.json`, `tsconfig.json`, the
  lockfile) is harness, and a submission that changes any of it is rejected.
- `npm test` builds the project and runs the public tests in `tests/public/`.
- Local results help you iterate. Acceptance is decided by a separate run of
  your code against a hidden suite, written from `spec.md` and
  `src/index.ts` alone by someone who saw neither the public tests nor your
  code, under this rule: every scenario in the spec is tested, every
  scenario kind it tags (happy, boundary, unhappy, any other) is tested, and
  each scenario has at least one case whose inputs differ from every example
  the spec writes down: other values, other sizes, other orders, other
  combinations. The public tests show how the interface is called, not how
  far the checking goes.
- There is no network and nothing to install.

Before you stop, go through `spec.md` scenario by scenario. For each
scenario, name one case that no public test exercises and check your code
against it, with a throwaway script that you delete before you stop. Fix
what fails, then run `npm test` again.

Stop when every scenario has survived that check. End with a short summary
of what you built and, per scenario, the extra case you checked.
