# One way to show byte counts in the web app

`ComplexityProfile.tsx` has its own `size()` that shows bytes or whole
kilobytes, and nothing shows megabytes. Add a shared `byteSize` formatter to
`apps/web/src/lib/format.ts` beside `money` and `plural`: bytes, KB, MB, GB
and TB, with a decimal for small values so 1.5 KB doesn't read as 2 KB.
