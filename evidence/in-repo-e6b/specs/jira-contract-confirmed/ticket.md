# feat(jira): recover the Jira integration package and its wire contract (#25)

* feat(jira): recover the Jira integration package and its wire contract

* fix(jira): strip trailing slashes without a backtracking regex

`siteUrl.replace(/\/+$/, "")` appeared in `ApiTokenCredential` and in
`toIssueDto`, both recovered verbatim from the lost package's compiled
output. CodeQL flagged both as high-severity ReDoS (alerts 72 and 73):
the anchored greedy repetition retries from every position, so a site URL
ending in many slashes takes O(n^2). Measured at ~1300ms for 60,000
slashes, which blocks the event loop for every other request the process
is serving.

`siteUrl` is not ours: it comes from Atlassian's accessible-resources
response and from the stored `jira_connection` row.

Replaced with a backwards scan in one shared helper, and pinned by a test
that fails on the old implementation (1300ms against a 250ms threshold)
while passing in 0ms on this one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

---------

## Interface

The change keeps the exports' names and signatures.
