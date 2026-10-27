### independent-tests (drafted): incomplete: public 0/52, hidden 0/47, existing 0/139

| verdict | public | hidden | existing |
| --- | ---: | ---: | ---: |
| **incomplete** | 0/52 | 0/47 | 0/139 |

Failing scenarios (keys from the spec; the hidden tests stay hidden): `boundary-1`, `boundary-10`, `boundary-11`, `boundary-12`, `boundary-2`, `boundary-5`, `boundary-6`, `boundary-7`, `boundary-8`, `boundary-9`, `concurrency-1`, `happy-10`, `happy-4`, `happy-5`, `happy-6`, `happy-7`, `happy-8`, `happy-9`, `unhappy-1`, `unhappy-2`, `unhappy-3`

The change does not compile with the public suite.

Regressions (passed on base plus stub, fail now):
- `test/agent.test.ts :: agent parameters name their tool, and a scope run is never a slice`
- `test/agent.test.ts :: every tool has a version`
- `test/agent.test.ts :: a scope submission becomes the canonical slice request`
- `test/agent.test.ts :: seams must be modules the request cuts, each once`
- `test/agent.test.ts :: a fixture's mock path is the name the generated runtime records`
- `test/agent.test.ts :: fixtures must name mocked values and be self-contained function expressions`
- `test/agent.test.ts :: a scenario must be present and bounded`
- `test/analysis.test.ts :: cache parameters use recursively stable object order`
- `test/analysis.test.ts :: an expired lease retries only within the configured allowance`
- `test/bounty.test.ts :: validates and normalizes a nondecreasing rate card`
- `test/bounty.test.ts :: rejects unsupported currencies, invalid amounts and descending rates`
- `test/bounty.test.ts :: maps sizes to the card and leaves unsized unpriced`
- `test/bounty.test.ts :: prices a half size at the midpoint of its neighbours, to a whole minor unit`
- `test/bounty.test.ts :: the model and the resize keep the five whole sizes; pricing has nine`
- `test/bounty.test.ts :: parses decimal money exactly and rejects excess precision`
- `test/bounty.test.ts :: formats minor units exactly for zero and fractional currencies`
- `test/bounty.test.ts :: XS must be positive and no greater than S`
- `test/bounty.test.ts :: USD rate-card writes cap XL at 1,000 without imposing that limit on other currencies`
- `test/handle.test.ts :: a handle is stored lowercase, keeping the typed casing for display`
- `test/handle.test.ts :: toHandleCase trims and lowercases without judging validity`
- `test/handle.test.ts :: handles that are too short or too long are refused`
- `test/handle.test.ts :: the boundary lengths themselves are accepted`
- `test/handle.test.ts :: handles with characters that break a URL or a mention are refused`
- `test/handle.test.ts :: hyphens and underscores are allowed`
- `test/handle.test.ts :: a rejection carries wording that can be shown as-is`
- `test/handle.test.ts :: checkHandle judges an already-normalized handle`
- `test/handle.test.ts :: isValidHandle answers the question a submit button asks`
- `test/handle.test.ts :: a stem is derived from the local part of an address`
- `test/handle.test.ts :: characters that are not handle-safe become hyphens`
- `test/handle.test.ts :: a short stem is padded to a usable length`
- `test/handle.test.ts :: a long stem is truncated to the maximum length`
- `test/handle.test.ts :: surrounding hyphens are trimmed but inner ones are kept`
- `test/handle.test.ts :: a run of only hyphens does not hang`
- `test/handle.test.ts :: an organization name becomes a reasonable stem`
- `test/handle.test.ts :: every stem is a valid handle, however unpromising the input`
- `test/respec.test.ts :: a scenario is the same one across revisions by kind and title`
- `test/respec.test.ts :: an expansion adds after the spec's own scenarios and touches nothing else`
- `test/respec.test.ts :: an expansion stops at the cap on a revision, scenarios and notes alike`
- `test/respec.test.ts :: new scenarios are numbered past every id the revision has`
- `test/respec.test.ts :: an answered spec keeps the scenarios it kept, and drops the answered questions`
- `test/respec.test.ts :: an answered spec is cut at the cap on a revision`
- `test/respec.test.ts :: a trim takes scenarios out and leaves the rest with their ids`
- `test/respec.test.ts :: a request is checked against the revision it changes`
- `test/respec.test.ts :: a change's points can go either way, and need weights on both sides`
- `test/respec.test.ts :: an expansion and a trim move the step, and a trim never goes below the base`
- `test/respec.test.ts :: two revisions are the same when they say the same thing`
- `test/respec.test.ts :: a request is described for the spec's history`
- `test/sandbox.test.ts :: alias rules are validated as a set: empty, identity, duplicates, chains and casing`
- `test/sandbox.test.ts :: aliases apply to whole identifiers only, rename paths, and prove the inverse`
- `test/sandbox.test.ts :: a target already present in the text is a collision, not a silent merge`
- … 89 more

Hidden suite sha256 `b5b1572e12366c7c1208a0daa90d4e25b2d126eabc453d71409093517953b56d`, sealed 2026-10-26T04:35:59.630Z. Commit `ee0bef013a078340116991400e3bfb1a730560be`.

