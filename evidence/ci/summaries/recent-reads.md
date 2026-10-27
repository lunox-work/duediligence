### independent-tests (drafted): incomplete: public 0/58, hidden 0/52, existing 0/885

| verdict | public | hidden | existing |
| --- | ---: | ---: | ---: |
| **incomplete** | 0/58 | 0/52 | 0/885 |

Failing scenarios (keys from the spec; the hidden tests stay hidden): `boundary-1`, `boundary-10`, `boundary-11`, `boundary-12`, `boundary-13`, `boundary-14`, `boundary-15`, `boundary-2`, `boundary-3`, `boundary-4`, `boundary-5`, `boundary-6`, `boundary-7`, `boundary-8`, `boundary-9`, `concurrency-1`, `happy-1`, `happy-2`, `happy-3`, `happy-4`, `happy-5`, `happy-6`, `happy-7`, `happy-8`, `happy-9`, `unhappy-1`, `unhappy-2`, `unhappy-3`, `unhappy-4`

The change does not compile with the public suite.

Regressions (passed on base plus stub, fail now):
- `test/agent-routes.test.ts :: a scope run names the proposal's spec revision and queues behind the graph`
- `test/agent-routes.test.ts :: a scope run refuses members, bad bodies, other repositories and proposals without a spec`
- `test/agent-routes.test.ts :: a fixtures run is written for a succeeded slice, on its snapshot`
- `test/agent-routes.test.ts :: a repository's proposals are the workspace's specced ones, newest first`
- `test/agent-routes.test.ts :: agent runs name the snapshot's succeeded context runs, and only those there are`
- `test/analysis-enqueue.test.ts :: queue coordination cleans obsolete logs and records a prerequisite wake-up before a later capacity refusal`
- `test/analysis.test.ts :: a slice checks its entry points against the tree and queues behind the graph run`
- `test/analysis.test.ts :: a slice reports a failed or mismatched graph run and cleans obsolete logs`
- `test/analysis.test.ts :: enqueue validates scope, role, parameters, cache result, and active cap`
- `test/analysis.test.ts :: a removed builder is not queued`
- `test/analysis.test.ts :: a builder that reads the map queues behind the snapshot's graph run`
- `test/analysis.test.ts :: Build all queues the whole set once the cap admits its first run`
- `test/analysis.test.ts :: Build all answers built runs as is, with each builder's parameters`
- `test/analysis.test.ts :: Build all skips the map readers when the graph is out of retries`
- `test/analysis.test.ts :: Build all is refused for members, bad input, and other repositories`
- `test/analysis.test.ts :: a set refused partway still wakes a worker for what it queued`
- `test/analysis.test.ts :: launch errors keep the queued response for watchdog recovery`
- `test/analysis.test.ts :: members read runs and artifacts; signed downloads are private and uncached`
- `test/analysis.test.ts :: a repository's runs can be read for one snapshot`
- `test/analysis.test.ts :: a sandbox build's run and artifacts are not a member's to read`
- `test/analysis.test.ts :: members read an artifact as text, unless it is binary or too large`
- `test/analysis.test.ts :: owners and admins read a run's log as text; members cannot`
- `test/analysis.test.ts :: launcher coalesces launches and skips fresh workers, empty queues, and local mode`
- `test/analysis.test.ts :: watchdog expires owners before launch, coalesces sweeps, and stops cleanly`
- `test/anthropic-caller.test.ts :: forced tool output is validated and returns actual usage metadata`
- `test/anthropic-caller.test.ts :: malformed output gets one retry that names the field and never echoes model text`
- `test/anthropic-caller.test.ts :: an answer the output limit cut short is retried as such`
- `test/anthropic-caller.test.ts :: a transient failure retries with the data alone`
- `test/anthropic-caller.test.ts :: multiple or unexpected tool results fail after two requests`
- `test/anthropic-caller.test.ts :: a transient response retries once and respects Retry-After`
- `test/anthropic-caller.test.ts :: authentication and invalid-model failures stop the run without retry`
- `test/anthropic-caller.test.ts :: external cancellation is classified without a provider request`
- `test/anthropic-caller.test.ts :: a retry that cannot fit before the run deadline becomes a timeout`
- `test/anthropic-caller.test.ts :: an attempt is given the time its tool asks for, inside the run's deadline`
- `test/anthropic-caller.test.ts :: a strict schema carries its limits as prose, at every depth`
- `test/anthropic-caller.test.ts :: a schema keyword that only looks like a limit is left alone`
- `test/anthropic-caller.test.ts :: FakeCaller answers by tool name, from a queue or a function`
- `test/auth.test.ts :: a failed sign-in is redirected to the web app, not the API`
- `test/auth.test.ts :: createAuth exposes a request handler and a session reader`
- `test/auth.test.ts :: createAuth enables social sign-in`
- `test/auth.test.ts :: email and password sign-up is rejected`
- `test/auth.test.ts :: email and password sign-in is rejected`
- `test/auth.test.ts :: createAuth accepts a cookie domain for cross-subdomain deploys`
- `test/auth.test.ts :: an unauthenticated getSession returns null rather than throwing`
- `test/auth.test.ts :: linking requires a session`
- `test/auth.test.ts :: listing linked accounts requires a session`
- `test/auth.test.ts :: a new account is given a generated handle`
- `test/auth.test.ts :: each provider's own address is recorded, not the account's`
- `test/auth.test.ts :: two concurrent sign-ins do not cross their addresses`
- `test/auth.test.ts :: the account hook survives running outside a request context`
- … 835 more

Hidden suite sha256 `ddc25f9852e5db4565e2c72f728b6d72b511a52200d2982a35f2841a4566bf86`, sealed 2026-10-26T04:35:59.327Z. Commit `d937dcdba623213dcdef87939ce4195edff52144`.

