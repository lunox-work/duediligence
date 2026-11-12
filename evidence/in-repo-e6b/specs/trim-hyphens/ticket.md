# fix: trim handle hyphens without a backtracking regex (#21)

CodeQL flagged `replace(/^-+|-+$/g, "")` in `toHandleBase` as a polynomial
ReDoS. On a local part that is a long run of hyphens, the `-+$` alternative
retries from every offset before failing, which is quadratic in the length
of the run.

The input is the local part of a provider-supplied address, so it is not
ours to bound, and the truncation to USERNAME_MAX_LENGTH happens after the
trim rather than before, so it does not cap the work either.

Index arithmetic has no such failure mode. Verified identical to the regex
across the edge cases and several thousand fuzzed inputs, including the
all-hyphen string that trims to empty.

## Interface

The change keeps the exports' names and signatures.
