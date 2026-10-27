Implement the specification in `spec.md`.

- The interface is drafted in `src/index.ts`, with bodies that throw
  `not implemented`. Keep its exported names and signatures.
- The task's code lives under `src/`. Change it and add new files there;
  everything else (`sandbox/`, `package.json`, `tsconfig.json`, the
  lockfile) is harness, and a submission that changes any of it is rejected.
- There are no tests here, and you do not write any. `npm run build`
  compiles the project.
- Acceptance is decided by a separate run of your code against a hidden
  suite, written from `spec.md` and `src/index.ts` alone by someone who
  never saw your code, under this rule: every scenario in the spec is
  tested, every scenario kind it tags (happy, boundary, unhappy, any other)
  is tested, and each scenario has at least one case whose inputs differ
  from every example the spec writes down: other values, other sizes, other
  orders, other combinations.
- There is no network and nothing to install.

Before you stop, go through `spec.md` scenario by scenario. For each
scenario, name one case whose inputs differ from the spec's own examples
and check your code against it, with a throwaway script that you delete
before you stop. Fix what fails, then run `npm run build` again.

Stop when every scenario has survived that check. End with a short summary
of what you built and, per scenario, the extra case you checked.
