import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_ISSUE_TYPE,
  TICKET_LIMITS,
  TICKET_ORIGINS,
  TICKET_SPEC_HASH_VERSION,
  type TicketOrigin,
} from "../src/ticket.js";

/**
 * The constants every surface takes from `packages/core/src/ticket.ts`
 * instead of keeping its own copy.
 */

test("[happy-1] the origins are manual then jira, in that order", () => {
  assert.deepEqual([...TICKET_ORIGINS], ["manual", "jira"]);
});

test("[happy-1] there are exactly two origins and each is a TicketOrigin", () => {
  const manual: TicketOrigin = "manual";
  const jira: TicketOrigin = "jira";
  assert.equal(TICKET_ORIGINS.length, 2);
  assert.equal(TICKET_ORIGINS[0], manual);
  assert.equal(TICKET_ORIGINS[1], jira);
  assert.equal(new Set(TICKET_ORIGINS).size, 2);
});

test("[happy-2] the default issue type is Task and the hash version is 1", () => {
  assert.equal(DEFAULT_ISSUE_TYPE, "Task");
  assert.equal(TICKET_SPEC_HASH_VERSION, 1);
});

test("[happy-2] the default issue type is case-exact and the version is a number", () => {
  // A stored specHashVersion is compared as a number, not a string.
  assert.notEqual(DEFAULT_ISSUE_TYPE, "task");
  assert.equal(typeof TICKET_SPEC_HASH_VERSION, "number");
  assert.ok(DEFAULT_ISSUE_TYPE.length <= TICKET_LIMITS.issueType);
});

test("[happy-3] the ticket limits have exactly these keys and values", () => {
  assert.deepEqual(
    { ...TICKET_LIMITS },
    {
      title: 255,
      description: 20000,
      issueType: 64,
      priority: 64,
      labels: 20,
      label: 64,
    },
  );
});

test("[happy-3] the ticket limits have no component cap and are not frozen", () => {
  assert.deepEqual(Object.keys(TICKET_LIMITS).sort(), [
    "description",
    "issueType",
    "label",
    "labels",
    "priority",
    "title",
  ]);
  assert.equal("components" in TICKET_LIMITS, false);
  assert.equal(Object.isFrozen(TICKET_LIMITS), false);
});
