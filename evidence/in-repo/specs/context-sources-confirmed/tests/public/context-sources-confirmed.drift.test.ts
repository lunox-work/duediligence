import assert from "node:assert/strict";
import { test } from "node:test";

import { NO_CONTEXT, contextDrift } from "../src/sources.js";

test("[happy-12] drift per source", () => {
  const cases = [
    { current: { jira: 3, github: 2 }, used: { jira: 3, github: 2 }, drift: { jira: null, github: null } },
    {
      current: { jira: 4, github: 2 },
      used: { jira: 3, github: 2 },
      drift: { jira: { uses: 3, current: 4 }, github: null },
    },
    {
      current: { jira: 4, github: 5 },
      used: { jira: null, github: null },
      drift: { jira: { uses: null, current: 4 }, github: { uses: null, current: 5 } },
    },
    {
      current: { jira: 1, github: 7 },
      used: { jira: 1, github: 6 },
      drift: { jira: null, github: { uses: 6, current: 7 } },
    },
  ];
  for (const { current, used, drift } of cases) {
    assert.deepEqual(
      contextDrift(current, used),
      drift,
      JSON.stringify({ current, used }),
    );
  }
});

test("[happy-12] version 0 is a version, not none", () => {
  assert.deepEqual(contextDrift({ jira: 1, github: 0 }, { jira: 0, github: null }), {
    jira: { uses: 0, current: 1 },
    github: { uses: null, current: 0 },
  });
});

test("[boundary-16] nothing is behind a source the overview holds no version of, or a step ahead of it", () => {
  const cases = [
    { current: { jira: null, github: null }, used: { jira: 2, github: 1 } },
    { current: { jira: null, github: null }, used: { jira: null, github: null } },
    { current: { jira: 2, github: 1 }, used: { jira: 3, github: 4 } },
  ];
  for (const { current, used } of cases) {
    assert.deepEqual(
      contextDrift(current, used),
      { jira: null, github: null },
      JSON.stringify({ current, used }),
    );
  }
});

test("[boundary-16] one source with no version and the other a step ahead gives no drift", () => {
  assert.deepEqual(contextDrift({ jira: null, github: 2 }, { jira: null, github: 3 }), {
    jira: null,
    github: null,
  });
});

test("[boundary-17] NO_CONTEXT against itself", () => {
  assert.deepEqual(contextDrift(NO_CONTEXT, NO_CONTEXT), {
    jira: null,
    github: null,
  });
});

test("[boundary-17] a step that used NO_CONTEXT is behind every source the overview holds", () => {
  assert.deepEqual(contextDrift({ jira: 1, github: 1 }, NO_CONTEXT), {
    jira: { uses: null, current: 1 },
    github: { uses: null, current: 1 },
  });
});
