import assert from "node:assert/strict";
import { test } from "node:test";

import { NO_CONTEXT, contextDrift } from "../../src/sources.js";

/**
 * contextDrift: per source, null when the overview holds no version, a
 * drift when the step used none or an older one, null otherwise.
 */

// Extends "[happy-11] drift per source".
test("[happy-11] a current version of 0 drifts from a step that used none", () => {
  assert.deepEqual(contextDrift({ jira: 0, github: 0 }, { jira: null, github: null }), {
    jira: { uses: null, current: 0 },
    github: { uses: null, current: 0 },
  });
});

// Extends "[happy-11] a step one version behind drifts, and the arguments are not changed".
test("[happy-11] large gaps and mixed sources", () => {
  assert.deepEqual(contextDrift({ jira: 100, github: 3 }, { jira: 1, github: 3 }), {
    jira: { uses: 1, current: 100 },
    github: null,
  });
  assert.deepEqual(contextDrift({ jira: 2, github: 9 }, { jira: null, github: 8 }), {
    jira: { uses: null, current: 2 },
    github: { uses: 8, current: 9 },
  });
  assert.deepEqual(contextDrift({ jira: 5, github: 1 }, { jira: 6, github: 0 }), {
    jira: null,
    github: { uses: 0, current: 1 },
  });
});

// Extends "[boundary-19] nothing is behind a source the overview holds no version of, or a step ahead of it".
test("[boundary-19] a step far ahead, or a source the overview never held, is not behind", () => {
  const cases: [number | null, number | null, number | null, number | null][] = [
    [null, 5, null, 50],
    [0, null, 0, 7],
    [5, 5, 5, 6],
    [0, 0, 0, 0],
    [null, null, 0, 0],
  ];
  for (const [cj, cg, uj, ug] of cases) {
    assert.deepEqual(
      contextDrift({ jira: cj, github: cg }, { jira: uj, github: ug }),
      { jira: null, github: null },
      JSON.stringify([cj, cg, uj, ug]),
    );
  }
});

// Extends "[boundary-20] NO_CONTEXT against itself".
test("[boundary-20] NO_CONTEXT against itself and against a plain object of nulls", () => {
  const nulls = { jira: null, github: null };
  assert.deepEqual(contextDrift(NO_CONTEXT, NO_CONTEXT), nulls);
  assert.deepEqual(contextDrift({ jira: null, github: null }, NO_CONTEXT), nulls);
  assert.deepEqual(contextDrift(NO_CONTEXT, { jira: null, github: null }), nulls);
  assert.equal(NO_CONTEXT.jira, null);
  assert.equal(NO_CONTEXT.github, null);
});
