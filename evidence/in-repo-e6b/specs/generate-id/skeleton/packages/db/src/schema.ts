/**
 * Drizzle schema barrel. The tables live in `./schema/` (`auth.ts`,
 * `organizations.ts`, `todos.ts`); this file defines none of its own and
 * re-exports them under the same names, so every importer and
 * `drizzle.config.ts` keep working unchanged.
 */

export {
  account,
  session,
  user,
  userEmail,
  verification,
} from "./schema/auth.js";
export type {
  AccountRow,
  NewUserEmailRow,
  SessionRow,
  UserEmailRow,
  UserRow,
  VerificationRow,
} from "./schema/auth.js";
export { invitation, member, organization } from "./schema/organizations.js";
export type {
  InvitationRow,
  MemberRow,
  NewMemberRow,
  NewOrganizationRow,
  OrganizationRow,
} from "./schema/organizations.js";
export { todos } from "./schema/todos.js";
export type { NewTodoRow, TodoRow } from "./schema/todos.js";
