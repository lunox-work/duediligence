`src/` implements a module that is in use. `spec.md` is a change request
for it. Make the change.

- Keep the exported names and signatures in `src/index.ts`.
- The task's code lives under `src/`. Change it and add new files there;
  everything else (`sandbox/`, `package.json`, `tsconfig.json`, the
  lockfile) is harness, and a submission that changes any of it is rejected.
- There are no tests here, and you do not write any. `npm run build`
  compiles the project.
- Acceptance is decided by a separate run of your code against tests that
  are not in this directory.
- There is no network and nothing to install.

Stop when you consider the change made. End with a short summary of what
you changed.
