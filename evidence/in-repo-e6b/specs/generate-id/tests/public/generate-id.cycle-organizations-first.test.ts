import assert from "node:assert/strict";
import { test } from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";

/**
 * `schema/auth.ts` and `schema/organizations.ts` import each other. This file
 * runs in its own process and imports nothing from the schema statically, so
 * the dynamic import below is the first to load `organizations.js`.
 */

test("[boundary-5] with organizations.js loaded first, the cross-module foreign keys resolve", async () => {
  const organizationsModule = await import("../src/schema/organizations.js");
  const { session, user } = await import("../src/schema/auth.js");
  const { member, organization } = await import(
    "../src/schema/organizations.js"
  );
  assert.notEqual(organizationsModule, undefined);

  const activeOrganization = getTableConfig(session).foreignKeys.find(
    (fk) => fk.reference().columns[0]?.name === "active_organization_id",
  );
  const sessionTarget = activeOrganization?.reference().foreignTable;
  assert.notEqual(sessionTarget, undefined);
  assert.equal(sessionTarget, organization);
  assert.equal(
    getTableConfig(sessionTarget as typeof organization).name,
    "organization",
  );

  const memberUser = getTableConfig(member).foreignKeys.find(
    (fk) => fk.reference().columns[0]?.name === "user_id",
  );
  const memberTarget = memberUser?.reference().foreignTable;
  assert.notEqual(memberTarget, undefined);
  assert.equal(memberTarget, user);
  assert.equal(getTableConfig(memberTarget as typeof user).name, "user");
});
