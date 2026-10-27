`src/` implements a module that is in use. `spec.md` is a change request
for it. Make the change.

- Keep the exported names and signatures in `src/index.ts`.
- The task's code lives under `src/`. Change it and add new files there;
  everything else (tests, `sandbox/`, `package.json`, `tsconfig.json`, the
  lockfile) is harness, and a submission that changes any of it is rejected.
- `npm test` builds the project and runs the public tests in `tests/public/`,
  which describe the module's behaviour after the change.
- Local results help you iterate. Acceptance is decided by a separate run of
  your code, including tests that are not in this directory.
- There is no network and nothing to install.

Stop when you consider the change made. End with a short summary of what
you changed.
