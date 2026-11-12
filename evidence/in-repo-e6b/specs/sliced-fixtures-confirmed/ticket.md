# feat(sandbox): sliced builds write their own fixtures, and the scope reads abstractions and the data model (#100)

* refactor(worker): remove the deepwiki and dependency-cruiser builders

Nothing downstream read either builder: the scope, slice, fixtures and
build pipeline read only graphify's map. dependency-cruiser was still a
required builder, so every snapshot waited on it before counting as
built. DeepWiki read the default branch head rather than the snapshot
and sent a repository read token to an outside service.

- Drop both tools, their parameters, summary schemas, artifact kinds and
  the now unused builder_unavailable error code. REQUIRED_BUILDERS and
  downloadsSource collapse into CONTEXT_BUILDERS and readsSource.
- Remove their worker adapters, DeepWiki-Open config, worker
  dependencies (dependency-cruiser, @swc/core), compose services, make
  targets and env keys. The root dependency-cruiser stays for lint:deps.
- Migration 0063 ends any of their runs still queued or running as
  cancelled, so none holds an active-run slot; finished runs are kept
  and reads already skip them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

* feat(sandbox): sliced builds write their own fixtures; the profiler's scope reads abstractions and the data model

A sliced draft with no fixtures has the fixtures agent write them and the
walkthrough before the pseudonyms, so they are renamed with the rest; they settle
on the draft with the build. The build gets the snapshot's newest data_model run
when the API queues it. The bounty profiler enqueues or finds the abstractions and
data_model runs on the graph, waits for them, and names the ones that succeeded in
the scope run.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

* docs: roadmap of proposed sandbox-quality and merge-back work

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

---------

## Interface

The change keeps the exports' names and signatures.
