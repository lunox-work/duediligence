#!/usr/bin/env bash
# The outward half of Phase 3's fixture, NOT RUN: it creates repositories,
# pushes branches, sets a secret and opens 11 pull requests under the
# signed-in gh account. evidence/ci.mjs ran the same checks locally with the
# same script the workflow runs (bin/ci.mjs); this puts them on GitHub.
#
#   SEALS_TOKEN=<fine-grained PAT: contents read on $OWNER/sandbox-factory-seals> \
#   evidence/ci/fork-and-open-prs.sh <scratch clone with base/* and case/* branches> <seals dir>
#
# Before it: push this package to github.com/$OWNER/independent-tests (the
# workflow calls $OWNER/independent-tests/.github/workflows/judge.yml@main),
# and run, from the package root,
#   node evidence/ci.mjs branches --clone <clone>
#   node evidence/ci.mjs seal --seals <seals dir>
# After it: the checks land on each pull request; compare them with
#   node evidence/ci.mjs report
#
# What it does, in order:
#   1. forks lunox-work/sandbox-factory to $OWNER/sandbox-factory, with
#      Actions disabled while branches are pushed (the fork's own workflows
#      must not run on them);
#   2. pushes ci/main (the newest base/* commit: one workflow,
#      independent-tests.yml) as the fork's default branch, so
#      pull_request_target and scheduled workflows find nothing to run,
#      then every base/<slug> and case/<slug>;
#   3. creates the private $OWNER/sandbox-factory-seals and pushes the 22
#      seals as seals/case/<slug>/{confirmed,drafted}.seal.gz;
#   4. stores SEALS_TOKEN as the fork's SEALS_TOKEN secret, enables Actions;
#   5. opens one pull request per case: case/<slug> into base/<slug>.
set -euo pipefail

OWNER="${OWNER:-feversoul}"
UPSTREAM="lunox-work/sandbox-factory"
FORK="$OWNER/sandbox-factory"
SEALS_REPO="$OWNER/sandbox-factory-seals"
CLONE="${1:?usage: $0 <clone> <seals dir>}"
SEALS="${2:?usage: $0 <clone> <seals dir>}"
: "${SEALS_TOKEN:?set SEALS_TOKEN to a token that reads $SEALS_REPO}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SLUGS=$(node -e 'for (const c of require(process.argv[1])) console.log(c.slug)' "$HERE/../in-repo/cases.json")

# 1. The fork, Actions off.
gh repo fork "$UPSTREAM" --clone=false --default-branch-only
gh api -X PUT "repos/$FORK/actions/permissions" -F enabled=false

# 2. Branches. ci/main carries only the independent-tests workflow.
git -C "$CLONE" remote remove fork 2>/dev/null || true
git -C "$CLONE" remote add fork "git@github.com:$FORK.git"
git -C "$CLONE" branch -f ci/main "base/$(echo "$SLUGS" | tail -n 1)"
git -C "$CLONE" push --force fork ci/main
gh api -X PATCH "repos/$FORK" -f default_branch=ci/main
for slug in $SLUGS; do
  git -C "$CLONE" push --force fork "base/$slug" "case/$slug"
done

# 3. The private seal store.
gh repo create "$SEALS_REPO" --private --description "independent-tests seals for the sandbox-factory CI fixture"
store="$(mktemp -d)"
git -C "$store" init -q -b main
for slug in $SLUGS; do
  mkdir -p "$store/seals/case/$slug"
  cp "$SEALS/$slug-confirmed.seal.gz" "$store/seals/case/$slug/confirmed.seal.gz"
  cp "$SEALS/$slug.seal.gz" "$store/seals/case/$slug/drafted.seal.gz"
done
git -C "$store" add -A
git -C "$store" -c user.name=independent-tests -c user.email=independent-tests@localhost commit -qm "seals for the 11 cases, both arms"
git -C "$store" push -q "git@github.com:$SEALS_REPO.git" main
rm -rf "$store"

# 4. The secret, then Actions on.
printf '%s' "$SEALS_TOKEN" | gh secret set SEALS_TOKEN --repo "$FORK"
gh api -X PUT "repos/$FORK/actions/permissions" -F enabled=true -f allowed_actions=all

# 5. One pull request per case.
for slug in $SLUGS; do
  gh pr create --repo "$FORK" --base "base/$slug" --head "case/$slug" \
    --title "case: $slug" \
    --body "The commit's change inside its allowed paths, replayed at its parent (independent-tests evidence/in-repo/cases.json). Two checks judge it from sealed hidden suites: the confirmed spec's and the drafted spec's."
done
echo "Opened $(echo "$SLUGS" | wc -l | tr -d ' ') pull requests on $FORK; checks: gh pr checks <n> --repo $FORK"
