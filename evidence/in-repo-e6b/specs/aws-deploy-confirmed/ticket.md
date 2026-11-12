# feat: deploy to AWS via CloudFront, Fargate and Neon (#32)

* feat: deploy to AWS via CloudFront, Fargate and Neon

Serves platform.lunox.work from one CloudFront distribution: the SPA from a
private S3 bucket, /api/* from a Fargate task. One origin, because the app
already assumes one — apps/web/nginx.conf and the Vite dev proxy both put the
API under /api, so the session cookie stays host-only and no request needs a
CORS preflight.

Sized for the traffic it actually has (~$15/month) rather than the traffic it
might: no NAT Gateway ($32.85/mo), no load balancer ($16.43/mo), no RDS
($13.98/mo). ECS Service Discovery keeps a Route53 record pointed at the
running task, which is what an ALB would otherwise be paid to do, and Postgres
is Neon's free tier.

Dropping the load balancer removed the listener rule that enforced the
X-Origin-Verify header, so that check moves into the app: routes.ts gains
middleware, gated on an optional ORIGIN_VERIFY. Unset — locally, or behind a
load balancer — the check is not installed at all. /health is exempt so
container probes keep working.

CD runs on push to main, after the existing required checks have already
gated the merge. It migrates before rolling the service, publishes the SPA
after the API is stable, then asks /version whether the site is serving the
commit it just built — turning the repo's existing build-provenance machinery
into deploy verification.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(infra): point the origin record at the task's public IP

ECS Service Discovery cannot do the job it was given here. With awsvpc
networking it registers a task's *private* IP and offers no way to publish the
public one — correct for service-to-service traffic inside a VPC, and useless
to CloudFront, which resolves the origin from the public internet. The first
deploy produced a 502 from a task that was running, healthy, and answering
fine on its public address.

Replaced with an EventBridge rule and a small Python function: every ECS task
state change triggers a read of which tasks are RUNNING and an UPSERT of their
public IPs into api.platform.lunox.work. ~$0.20/month, against ~$16 for the
load balancer that is the sanctioned answer to the same problem.

The function's Route53 permission is scoped by three conditions — record name,
record type, and action — so a bug in it cannot touch the Zoho MX and DKIM
records that share the zone. It logs and skips rather than raising when no
task has a public IP: an exception would be retried, and retrying a stale
task-start event could publish an IP that has already been released.

Also drops the separate origin.lunox.work hosted zone, which existed only
because ECS owned every record in a namespace it managed. This function writes
one record by name, so that isolation no longer costs $0.50/month.

backend.hcl loses use_lockfile: that needs Terraform 1.10+ and this runs 1.5.7.
The alternative is a DynamoDB table, which is a resource to pay for so a single
operator cannot race themselves; CI only runs plan, which takes no lock.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* ci: let pull requests run terraform plan with a read-only role

The deploy role is scoped to `ref:refs/heads/main`, which is what stops a
fork's pull request from reaching AWS. It also means a pull request cannot run
`terraform plan` — the token carries `pull_request` in its `sub`, not a branch
ref — so every infrastructure PR failed the Plan job with "Not authorized to
perform sts:AssumeRoleWithWebIdentity". Correct behaviour, useless signal: a
plan is most valuable on the PR that proposes the change.

Adds a second identity trusted for `repo:<this repo>:pull_request` and nothing
else, with ReadOnlyAccess attached. A fork's PR carries its own repository in
that claim, so it still cannot assume this role, and read-only means the worst
a compromised workflow can do here is look.

ReadOnlyAccess rather than an enumerated policy because `plan` refreshes every
resource in the state: a hand-written list would fail opaquely each time the
stack gains a resource type, and the property that matters is that nothing can
be mutated.

The workflow picks the role by trigger, so pushes to main keep using the
deploy role.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(infra): match GitHub's immutable OIDC subject claims

Both trust policies expected `repo:owner/name:...`, which never matches here:
this repository has GitHub's immutable subject claims enabled, so the `sub` in
an OIDC token is `repo:owner@<org id>/name@<repo id>:...`. The numeric ids pin
the claim to this exact repository even if it is renamed or transferred, which
is the point of the feature — and the reason the plain-name form silently fails
to match rather than erroring in some legible way.

Caught on the Plan job, which failed with "Not authorized to perform
sts:AssumeRoleWithWebIdentity" against a role whose policy looked correct. The
deploy role carried the same mistake and would have failed the first CD run for
the same reason, several steps later and with more moving parts to rule out.

The prefix is a variable rather than assembled from var.github_repository,
because the ids are not derivable from the name — read them back with:

  gh api repos/OWNER/REPO/actions/oidc/customization/sub

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix: address review findings from the deployment PR

Four real problems, found by CodeRabbit on #32.

**The deploy role could never have worked.** cd.yml declares
`environment: production`, and a job that does gets `:environment:<name>` in
its OIDC subject instead of the branch ref — so the trust policy, which only
listed the ref form, would have rejected every CD run. The policy now accepts
both, which does not widen it: each value still pins this repository and either
the main branch or the production environment.

**The task had no health check.** Without a load balancer nothing else asks the
API whether it can serve, so ECS would call a deployment stable because the
process was alive, stop the old task, and leave a running-but-broken one in
production. Adds the check the ALB's target group used to perform, via `node`
rather than curl or wget — the runtime image is node:22-alpine and ships
neither.

**A failing terraform plan could report success.** The step's shell is `bash -e`
without `pipefail`, so the pipeline returned tee's status and the job passed on
a plan that never completed.

**The deploy role's ECS permissions were account-wide.** Now split: the calls
that take no resource keep the wildcard AWS requires, and the ones that act on
a running service are pinned to this cluster.

Also updates the README, which still described ECS Service Discovery
maintaining the origin record, and pointed at a `db_instance_class` variable
that went with RDS.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(infra): let the plan role read the secrets it plans

The pipefail fix in the previous commit did its job immediately: `terraform
plan` had been failing on the PR and reporting success, because the pipeline
returned tee's status. With that closed, the real error surfaced —
ReadOnlyAccess deliberately withholds secretsmanager:GetSecretValue, and
refreshing an `aws_secretsmanager_secret_version` reads the value back, so the
plan could not refresh at all.

Grants that one action, scoped to this project's eight secrets. The trade is
worth stating: a workflow with this role can read those production credentials.
It is already trusted to plan against the account, it can write nothing, and
the role is assumable only by pull requests from this repository — a fork's PR
carries its own repository in the subject claim and is rejected.

The alternative, `-refresh=false`, would hide genuine drift. That is the worse
trade: the plan on a PR exists to show what the change does to real
infrastructure, and one that cannot see the infrastructure is theatre.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix: address the second review pass

Four real problems from CodeRabbit's review of the rebased branch.

**The SPA publish could 404 its own assets.** `s3 sync --delete` removed the
previous hashed assets *before* the new index.html was uploaded, so anyone
loading the old document in that window requested files that no longer existed.
Now: upload the new assets, flip index.html, and leave the old ones to a 30-day
lifecycle rule — well past any live session, and fractions of a cent to keep.

**A failed secrets push left credentials half-rotated.** The loop wrote each
value as it read it, so a missing value near the end meant some secrets new,
some old, and an API booting with a mix. Validates everything first, then
writes.

**The origin-dns function could publish a dead IP.** Two task events can
interleave, and whichever invocation finishes last wins — including a stale one
holding an IP that has since been released. Reserved concurrency would have
serialised them, but this account's Lambda limit is the unraised default of 10
and AWS refuses a reservation below that floor. The write is conditional
instead: read the record, skip when it already holds these addresses. A repeat
invocation is now a no-op, verified by invoking twice.

**Two documentation claims were false.** `api_desired_count` cannot scale the
service, because Terraform ignores `desired_count` by design; and the quick
start still said `cp .env.example .env`.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix: prune SPA assets by difference, not by age

The lifecycle rule added in the previous commit was a bad fix. It expired
everything under assets/ after 30 days, including the hashes the live
index.html points at — so a month without a deploy would have deleted the
running bundle, and the next CloudFront cache miss would have served an SPA
whose assets 404. Removed from the bucket as well as from the workflow.

Pruning by difference instead: delete what is in the bucket and not in the
directory just uploaded. The current set is never a candidate, however long
since the last deploy, and the old set goes immediately rather than after a
grace period — safe because index.html has already been flipped, so nothing
served from that point references it.

Also makes the origin-dns function honest about what it does not solve.
Read-then-write is not compare-and-swap: a stale invocation can still land
after a newer one. Proper serialisation needs a raised account quota plus
reserved concurrency, or a FIFO queue, and neither is done here. What is done
is a re-read immediately before publishing, so an invocation whose task died
mid-run drops out instead of writing a dead address — and a comment saying
plainly what residual risk remains and when to revisit it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix: order origin-record writes by event time, and give asset pruning a grace period

Two follow-ups from review, both about the same class of mistake: treating a
window as closed when it was only narrowed.

**The origin record could still be restored to a dead IP.** A re-read before
publishing is not compare-and-swap, so an older invocation finishing late could
overwrite a newer one. Reserved concurrency is the obvious fix and is
unavailable: this account sits under the new-account Lambda limit of 10, below
which AWS refuses any reservation.

So the writes are ordered instead. Each carries the ECS event time it came
from, in a TXT record written in the same atomic Route53 change batch as the A
record, and an invocation stands down when it finds a marker from a newer
event. "Last writer wins" becomes "newest event wins". Verified against the
live record: a replayed 2020 event stands down with "superseded by a newer
event" while the record is broken, and the next current event repairs it.

**Pruning assets immediately broke already-open tabs.** Flipping index.html does
not retire the documents browsers are already holding, and one of those can
request a lazy-loaded chunk hours later. Pruning now requires an object to be
both absent from the current build and older than 24 hours, so the live set is
never a candidate and a stale tab has a day to finish.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

* fix(ci): compare asset age numerically, not through a JMESPath filter

`Contents[?LastModified<='<string>']` relied on behaviour JMESPath does not
specify: its ordering operators are defined for numbers only, and a string
operand is specified to yield null, which drops every element. The result would
be a prune step that matches nothing, deletes nothing, and reports success —
invisible, and only noticed when the bucket had quietly grown for months.

This CLI build turns out to be more forgiving than the spec (a future cutoff
does return objects), so the step was working here. That is not worth depending
on across CLI versions when the failure mode is a silent no-op.

Converts both sides to epoch seconds in the shell and compares them there.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

---------

## Interface

The change adds or changes these exports (`…` is a value the ticket does not give):

In `apps/api/src/routes.ts`:

```ts
export interface AppOptions {
    store: TodoStore;
    corsOrigins: readonly string[];
    auth?: Auth | undefined;
    emails?: EmailStore | undefined;
    profiles?: UserProfileStore | undefined;
    originVerify?: string | undefined;
    buildInfo?: BuildInfoDto | undefined;
}

export function createApp({ store, corsOrigins, auth, emails, profiles, buildInfo = unknownBuildInfo, originVerify, }: AppOptions): Hono<AppEnv>;
```
