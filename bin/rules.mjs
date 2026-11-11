// The judging and calibration rules as pure functions over suite results:
// no imports, no I/O. bin/lib.mjs re-exports the suite helpers, bin/judge.mjs
// and bin/calibrate.mjs apply `judgement` and `calibration`, and the library
// entry (bin/api.mjs) exports those two as `verdict` and `calibrate`.
//
// A suite result is what a runner prints (bin/runners/shared.mjs):
//
//   { compiled, compileOutput, files: [{ file, crashed, timedOut, tests: [{ name, ok, skipped, error }] }] }
//
// and a test's id is `<file> :: <name>`.

/** Each test of a suite result, named `file :: test`. */
export const testsOf = (result) =>
  result.files.flatMap((file) =>
    file.tests.map((test) => ({ ...test, id: `${file.file} :: ${test.name}` })),
  );

/** How many of `ids` passed in a suite result; a test that never reported failed. */
export function count(result, ids) {
  const ok = new Set(testsOf(result).filter((test) => test.ok && !test.skipped).map((test) => test.id));
  return { passed: ids.filter((id) => ok.has(id)).length, total: ids.length };
}

/**
 * The spec scenario a test is keyed to, from the `[kind-n]` its name starts
 * with (prompts/public-tests.md, prompts/hidden-tests.md), or null.
 */
export const scenarioOf = (id) =>
  /^\[([a-z]+-\d+)\] /.exec(id.split(" :: ").at(-1))?.[1] ?? null;

/** Tests the baseline passed that `result` (the existing suite after a change) does not. */
export function regressionsOf(baseline, result) {
  const ok = new Set(testsOf(result).filter((test) => test.ok).map((test) => test.id));
  return baseline.passing.filter((id) => !ok.has(id));
}

/** Whether a repository path is in a folder of `allowedPaths` (ending in `/`) or is one of its files. */
export const allowedIn = (allowedPaths, path) =>
  (allowedPaths ?? []).some((allowed) => (allowed.endsWith("/") ? path.startsWith(allowed) : path === allowed));

/**
 * The verdict from counts: `refused` when the submission changed anything
 * outside what the agent may write, `incomplete` when a public test fails,
 * `regressed` when a test of the repository's existing suite that passed
 * before the change fails after it (never on the bundled template, which
 * has no existing suite), `passed` when every kept hidden test passes too,
 * `overfit` when one does not.
 */
export function verdict({ refused = [], publicCount, hiddenCount, regressions = [] }) {
  if (refused.length > 0) return "refused";
  if (publicCount.passed !== publicCount.total) return "incomplete";
  if (regressions.length > 0) return "regressed";
  return hiddenCount.total > 0 && hiddenCount.passed === hiddenCount.total ? "passed" : "overfit";
}

/**
 * The judge's rule (bin/judge.mjs) over a submission's outcomes:
 *
 *   public, hidden   the suites' results on the submission; null when not
 *                    run (a refused submission is not judged)
 *   publicIds, kept  the public test ids and the kept hidden test ids
 *                    (calibration.json)
 *   existing         a repository's existing suite after the change
 *   baseline         the existing suite before it: { passing } as
 *                    baseline.json keeps it, or a suite result
 *   refused          harness refusals already found, { path, change, reason }
 *                    (lib.mjs `scopeOf`: the hidden or public suite, existing
 *                    tests, lockfiles and config, symlinks)
 *   changed          the other changed paths, strings or { path, change },
 *                    the implementer's own tests left out
 *   allowedPaths     what the implementer may change; a changed path outside
 *                    it is reported, and refused under `strictScope`
 *
 * Returns { verdict, public, hidden, existing, regressions, refused,
 * outsideScope, failures, failedScenarios, publicFailing }: the counts as
 * `count` gives them (`existing` null without both existing and baseline),
 * the refusals including the strict scope's, each kept hidden test that did
 * not pass with its message, the scenario keys those are tied to (sorted),
 * and the ids of the public tests that did not pass.
 */
export function judgement({
  public: publicResult = null,
  hidden = null,
  publicIds = [],
  kept = [],
  existing = null,
  baseline = null,
  refused = [],
  changed = [],
  allowedPaths,
  strictScope = false,
}) {
  const items = changed.map((item) => (typeof item === "string" ? { path: item } : item));
  const outsideScope = Array.isArray(allowedPaths) ? items.filter((item) => !allowedIn(allowedPaths, item.path)) : [];
  const allRefused = [...refused, ...(strictScope ? outsideScope : [])];
  const counted = (result, ids) => (result === null ? { passed: 0, total: ids.length } : count(result, ids));
  const publicCount = counted(publicResult, publicIds);
  const hiddenCount = counted(hidden, kept);
  const passing =
    baseline === null ? null : Array.isArray(baseline.passing) ? baseline.passing : testsOf(baseline).filter((test) => test.ok && !test.skipped).map((test) => test.id);
  const regressions = existing === null || passing === null ? [] : regressionsOf({ passing }, existing);
  const reported = new Map(hidden === null ? [] : testsOf(hidden).map((test) => [test.id, test]));
  const failures =
    hidden === null
      ? []
      : kept
          .filter((id) => reported.get(id)?.ok !== true)
          .map((id) => ({ id, message: reported.get(id)?.error?.message ?? "did not run" }));
  return {
    verdict: verdict({ refused: allRefused, publicCount, hiddenCount, regressions }),
    public: publicCount,
    hidden: hiddenCount,
    existing: existing === null || passing === null ? null : count(existing, passing),
    regressions,
    refused: allRefused,
    outsideScope,
    failures,
    failedScenarios: [...new Set(failures.map((item) => scenarioOf(item.id)).filter(Boolean))].sort(),
    publicFailing: publicResult === null ? [] : testsOf(publicResult).filter((test) => !test.ok).map((test) => test.id),
  };
}

/**
 * The calibration rule (bin/calibrate.mjs) over the hidden suite's results
 * on the skeleton and on the reference: a test is kept only if it fails on
 * the skeleton inside its test (a passing or skipped test, or any test of a
 * file that crashes, is dropped) and the reference passes it. A suite that
 * does not compile against the skeleton drops the spec; so does one with
 * no test kept. `reference` null means the reference never ran: every test
 * left is dropped as one it cannot satisfy.
 *
 * Returns { status: "ok" | "dropped", reason, hiddenWritten, kept, dropped }
 * with `dropped` as [{ id, reason }] (a crashed file's id is `<file> :: *`),
 * plus `compileOutput` when the suite did not compile.
 */
export function calibration({ skeleton, reference = null }) {
  if (!skeleton.compiled)
    return {
      status: "dropped",
      reason: "The hidden suite does not compile against the skeleton.",
      compileOutput: skeleton.compileOutput,
      hiddenWritten: testsOf(skeleton).length,
      kept: [],
      dropped: [],
    };
  const dropped = [];
  for (const file of skeleton.files)
    if (file.crashed)
      dropped.push({ id: `${file.file} :: *`, reason: "The file crashes on the skeleton instead of failing a test." });
  for (const test of testsOf(skeleton))
    if (test.ok || test.skipped)
      dropped.push({ id: test.id, reason: test.skipped ? "Skipped." : "Passes on the skeleton." });

  const droppedIds = new Set(dropped.map((item) => item.id));
  const droppedFiles = new Set(
    dropped.filter((item) => item.id.endsWith(" :: *")).map((item) => item.id.slice(0, -5)),
  );
  const referenceTests = new Map(reference === null ? [] : testsOf(reference).map((test) => [test.id, test]));
  const hiddenIds = testsOf(skeleton).map((test) => test.id);
  for (const id of hiddenIds) {
    if (droppedIds.has(id)) continue;
    const test = referenceTests.get(id);
    if (test === undefined || !test.ok)
      dropped.push({
        id,
        reason: `The reference cannot satisfy it: ${test?.error?.message.split("\n")[0] ?? "it did not run"}`,
      });
  }
  const finalDropped = new Set(dropped.map((item) => item.id));
  const kept = hiddenIds.filter((id) => !finalDropped.has(id) && !droppedFiles.has(id.split(" :: ")[0]));
  return {
    status: kept.length > 0 ? "ok" : "dropped",
    reason: kept.length > 0 ? null : "No hidden test survived calibration.",
    hiddenWritten: hiddenIds.length,
    kept,
    dropped,
  };
}
