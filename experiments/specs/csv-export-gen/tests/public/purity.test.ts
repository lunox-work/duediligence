import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequisitionsCsv, type Requisition } from "../../src/index.js";

function snapshot(requisition: Requisition): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...requisition };
  copy.createdAt = requisition.createdAt.getTime();
  return copy;
}

test("[happy-7] the input array and its requisitions are left unchanged", () => {
  const reqB: Requisition = { id: "req-b", title: "B", status: "open", openings: 1, filled: 0, createdAt: new Date("2026-03-02T00:00:00.000Z") };
  const reqA: Requisition = { id: "req-a", title: "A", status: "open", openings: 1, filled: 0, createdAt: new Date("2026-03-01T00:00:00.000Z") };
  const requisitions = [reqB, reqA];
  const before = requisitions.map(snapshot);

  const first = buildRequisitionsCsv(requisitions);

  assert.equal(requisitions.length, 2);
  assert.equal(requisitions[0], reqB);
  assert.equal(requisitions[1], reqA);
  assert.deepEqual(requisitions.map((r: Requisition) => r.id), ["req-b", "req-a"]);
  assert.deepEqual(requisitions.map(snapshot), before);

  const second = buildRequisitionsCsv(requisitions);
  assert.equal(second, first);
});

test("[happy-7] boundary: a requisition without a title gains no property and keeps its Date instance", () => {
  const createdAt = new Date("2026-03-01T00:00:00.000Z");
  const requisition: Requisition = { id: "req-1", status: "open", openings: 1, filled: 0, createdAt };
  const requisitions = [requisition];

  const first = buildRequisitionsCsv(requisitions);

  assert.deepEqual(Object.keys(requisition), ["id", "status", "openings", "filled", "createdAt"]);
  assert.ok(!("title" in requisition));
  assert.equal(requisition.createdAt, createdAt);
  assert.equal(createdAt.getTime(), Date.parse("2026-03-01T00:00:00.000Z"));
  assert.equal(buildRequisitionsCsv(requisitions), first);
});
